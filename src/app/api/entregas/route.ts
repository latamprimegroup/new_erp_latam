import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncClientLTV } from '@/lib/client-ltv'
import { audit } from '@/lib/audit'

const createSchema = z.object({
  orderId: z.string().min(1),
  qtySold: z.number().int().positive(),
})

const updateSchema = z.object({
  qtyDelivered: z.number().int().min(0).optional(),
  accountsDelivered: z.string().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'DELIVERED', 'DELAYED']).optional(),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const where: Record<string, unknown> = {}
  if (status) where.status = status

  const deliveries = await prisma.delivery.findMany({
    where,
    include: {
      order: {
        include: { client: { include: { user: { select: { name: true, email: true } } } } },
      },
      responsible: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const [pendingCount, deliveredCount] = await Promise.all([
    prisma.delivery.count({ where: { status: { in: ['PENDING', 'IN_PROGRESS', 'DELAYED'] } } }),
    prisma.delivery.count({ where: { status: 'DELIVERED' } }),
  ])

  return NextResponse.json({
    deliveries,
    kpis: { pending: pendingCount, delivered: deliveredCount },
  })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'DELIVERER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { orderId, qtySold } = createSchema.parse(body)

    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!order) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })

    const existing = await prisma.delivery.findUnique({ where: { orderId } })
    if (existing) return NextResponse.json({ error: 'Entrega já registrada para este pedido' }, { status: 400 })

    const delivery = await prisma.delivery.create({
      data: {
        orderId,
        qtySold: qtySold || order.quantity,
        responsibleId: session.user.id,
      },
      include: {
        order: { include: { client: { include: { user: { select: { name: true } } } } } },
      },
    })

    return NextResponse.json(delivery)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao registrar' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'DELIVERER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { id, ...data } = body
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

    const update = updateSchema.parse(data)
    const delivery = await prisma.delivery.update({
      where: { id },
      data: {
        ...update,
        ...(update.status === 'DELIVERED' && { deliveredAt: new Date() }),
        responsibleId: session.user.id,
      },
      include: {
        order: { include: { client: { include: { user: { select: { name: true } } } } } },
      },
    })

    if (update.status === 'DELIVERED' && delivery.order.clientId) {
      syncClientLTV(delivery.order.clientId).catch(console.error)
    }

    await audit({
      userId: session.user.id,
      action: 'delivery_updated',
      entity: 'Delivery',
      entityId: delivery.id,
      details: { status: update.status },
    })

    return NextResponse.json(delivery)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}
