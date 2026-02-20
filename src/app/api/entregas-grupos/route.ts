import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { generateGroupNumber } from '@/lib/delivery-group-utils'
import { getPaginationParams, paginatedResponse } from '@/lib/pagination'
import { getGroupMetrics } from '@/lib/delivery-metrics'

const createSchema = z.object({
  clientId: z.string().min(1),
  orderId: z.string().optional(),
  whatsappGroupLink: z.string().min(5),
  accountType: z.enum(['USD', 'BRL']),
  quantityContracted: z.number().int().positive(),
  currency: z.string().default('BRL'),
  paymentType: z.enum(['AUTOMATICO', 'MANUAL']),
  estimatedTimeHours: z.number().int().positive().optional(),
  saleDate: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'DELIVERER', 'COMMERCIAL']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  const status = searchParams.get('status')
  const accountType = searchParams.get('accountType')
  const paymentType = searchParams.get('paymentType')
  const currency = searchParams.get('currency')
  const periodStart = searchParams.get('periodStart')
  const periodEnd = searchParams.get('periodEnd')
  const orderBy = searchParams.get('orderBy') // 'createdAt' | 'priority'
  const { page, limit, skip } = getPaginationParams(searchParams)

  const where: Record<string, unknown> = {}
  if (clientId) where.clientId = clientId
  if (status) where.status = status
  if (accountType) where.accountType = accountType
  if (paymentType) where.paymentType = paymentType
  if (currency) where.currency = currency
  if (periodStart || periodEnd) {
    where.createdAt = {}
    if (periodStart) (where.createdAt as Record<string, Date>).gte = new Date(periodStart)
    if (periodEnd) (where.createdAt as Record<string, Date>).lte = new Date(periodEnd)
  }

  const [items, total, kpis] = await Promise.all([
    prisma.deliveryGroup.findMany({
      where,
      include: {
        client: { include: { user: { select: { name: true, email: true } } } },
        responsible: { select: { name: true, email: true } },
        order: { select: { id: true, product: true } },
        _count: { select: { repositions: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: orderBy === 'priority' ? 0 : skip,
      take: orderBy === 'priority' ? Math.min(limit * 3, 100) : limit,
    }),
    prisma.deliveryGroup.count({ where }),
    getKpis(periodStart, periodEnd),
  ])

  let finalItems = items
  let priorityScores: (number | undefined)[] = []
  if (orderBy === 'priority' && items.length > 0) {
    const metrics = await Promise.all(items.map((d) => getGroupMetrics(d.id)))
    const withMetrics = items.map((d, i) => ({ ...d, priorityScore: metrics[i]?.priorityScore ?? 0 }))
    withMetrics.sort((a, b) => b.priorityScore - a.priorityScore)
    const sliced = withMetrics.slice(skip, skip + limit)
    finalItems = sliced.map(({ priorityScore, ...d }) => d)
    priorityScores = sliced.map((s) => s.priorityScore)
  }

  const paginated = paginatedResponse(finalItems, total, page, limit)
  const enriched = finalItems.map((d, i) => ({
    ...d,
    quantityPending: Math.max(0, d.quantityContracted - d.quantityDelivered),
    ...(priorityScores[i] !== undefined && { priorityScore: priorityScores[i] }),
  }))
  return NextResponse.json({
    ...paginated,
    items: enriched,
    kpis,
  })
}

async function getKpis(periodStart: string | null, periodEnd: string | null) {
  const periodWhere: Record<string, unknown> = {}
  if (periodStart || periodEnd) {
    periodWhere.createdAt = {}
    if (periodStart) (periodWhere.createdAt as Record<string, Date>).gte = new Date(periodStart)
    if (periodEnd) (periodWhere.createdAt as Record<string, Date>).lte = new Date(periodEnd)
  }

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    totalMonth,
    totalDelivered,
    pending,
    late,
    repositionsOpen,
    allForCompletion,
  ] = await Promise.all([
    prisma.deliveryGroup.count({
      where: { ...periodWhere, createdAt: { gte: startOfMonth } },
    }),
    prisma.deliveryGroup.aggregate({
      where: { ...periodWhere, status: 'FINALIZADA' },
      _sum: { quantityDelivered: true },
    }),
    prisma.deliveryGroup.count({
      where: { status: { in: ['AGUARDANDO_INICIO', 'EM_ANDAMENTO', 'PARCIALMENTE_ENTREGUE'] } },
    }),
    prisma.deliveryGroup.count({ where: { status: 'ATRASADA' } }),
    prisma.deliveryReposition.count({
      where: { status: { in: ['SOLICITADA', 'APROVADA'] } },
    }),
    prisma.deliveryGroup.findMany({
      where: { status: { not: 'CANCELADA' } },
      select: { quantityContracted: true, quantityDelivered: true },
    }),
  ])

  const totalContracted = allForCompletion.reduce((s, d) => s + d.quantityContracted, 0)
  const totalDeliveredSum = allForCompletion.reduce((s, d) => s + d.quantityDelivered, 0)
  const completionPercent = totalContracted > 0
    ? Math.round((totalDeliveredSum / totalContracted) * 100)
    : 0

  return {
    totalMonth,
    totalAccountsDelivered: Number(totalDelivered?._sum.quantityDelivered ?? 0),
    pending,
    late,
    repositionsOpen,
    completionPercent,
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'DELIVERER', 'COMMERCIAL']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = createSchema.parse(body)

    const client = await prisma.clientProfile.findUnique({ where: { id: data.clientId } })
    if (!client) {
      return NextResponse.json({ error: 'Cliente não encontrado na base' }, { status: 400 })
    }

    if (data.orderId) {
      const order = await prisma.order.findUnique({
        where: { id: data.orderId },
        include: { client: true },
      })
      if (!order || order.clientId !== data.clientId) {
        return NextResponse.json({ error: 'Pedido não encontrado ou não pertence ao cliente' }, { status: 400 })
      }
    }

    const existingLink = await prisma.deliveryGroup.findUnique({
      where: { whatsappGroupLink: data.whatsappGroupLink },
    })
    if (existingLink) {
      return NextResponse.json({ error: 'Link do grupo WhatsApp já cadastrado' }, { status: 400 })
    }

    const groupNumber = await generateGroupNumber()

    let expectedCompletionAt: Date | null = null
    if (data.estimatedTimeHours) {
      const d = new Date()
      d.setHours(d.getHours() + data.estimatedTimeHours)
      expectedCompletionAt = d
    }

    const delivery = await prisma.deliveryGroup.create({
      data: {
        groupNumber,
        clientId: data.clientId,
        orderId: data.orderId || null,
        whatsappGroupLink: data.whatsappGroupLink,
        accountType: data.accountType as 'USD' | 'BRL',
        quantityContracted: data.quantityContracted,
        currency: data.currency,
        paymentType: data.paymentType as 'AUTOMATICO' | 'MANUAL',
        estimatedTimeHours: data.estimatedTimeHours || null,
        expectedCompletionAt,
        saleDate: data.saleDate ? new Date(data.saleDate) : null,
        responsibleId: session.user.id,
        status: 'AGUARDANDO_INICIO',
      },
      include: {
        client: { include: { user: { select: { name: true, email: true } } } },
        responsible: { select: { name: true } },
      },
    })

    await prisma.deliveryGroupLog.create({
      data: {
        deliveryId: delivery.id,
        userId: session.user.id,
        action: 'delivery_group_created',
        entity: 'DeliveryGroup',
        entityId: delivery.id,
        details: { groupNumber, clientId: data.clientId },
      },
    })

    await audit({
      userId: session.user.id,
      action: 'delivery_group_created',
      entity: 'DeliveryGroup',
      entityId: delivery.id,
      details: { groupNumber },
    })

    return NextResponse.json({
      ...delivery,
      quantityPending: delivery.quantityContracted - delivery.quantityDelivered,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao criar entrega' }, { status: 500 })
  }
}
