import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { getPaginationParams, paginatedResponse } from '@/lib/pagination'
import { getAuthenticatedKey, withRateLimit } from '@/lib/rate-limit-api'

const createSchema = z.object({
  clientId: z.string().min(1),
  country: z.string().optional(),
  product: z.string().min(1),
  accountType: z.string().min(1),
  quantity: z.number().int().positive(),
  value: z.number().positive(),
  currency: z.string().optional(),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const clientId = searchParams.get('clientId')
  const { page, limit, skip } = getPaginationParams(searchParams)

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (clientId) where.clientId = clientId

  const [orders, total, pendingCount, completedCount] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        client: { include: { user: { select: { name: true, email: true } } } },
        seller: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.order.count({ where }),
    prisma.order.count({ where: { status: { in: ['PENDING', 'PAID', 'IN_DELIVERY'] } } }),
    prisma.order.count({ where: { status: 'DELIVERED' } }),
  ])

  const totalRevenue = await prisma.order.aggregate({
    where: { status: 'DELIVERED' },
    _sum: { value: true },
  })

  const paginated = paginatedResponse(orders, total, page, limit)
  return NextResponse.json({
    ...paginated,
    orders: paginated.items,
    kpis: {
      revenue: Number(totalRevenue._sum.value ?? 0),
      pending: pendingCount,
      completed: completedCount,
    },
  })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const key = getAuthenticatedKey(session.user!.id, 'vendas:create')
  const limited = withRateLimit(req, key, { max: 30, windowMs: 60_000 })
  if (limited) return limited

  const roles = ['ADMIN', 'COMMERCIAL']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = createSchema.parse(body)

    const order = await prisma.order.create({
      data: {
        clientId: data.clientId,
        country: data.country || null,
        product: data.product,
        accountType: data.accountType,
        quantity: data.quantity,
        value: data.value,
        currency: data.currency || 'BRL',
        status: 'AWAITING_PAYMENT',
        sellerId: session.user.id,
      },
      include: {
        client: { include: { user: { select: { name: true, email: true } } } },
        seller: { select: { name: true } },
      },
    })

    await audit({
      userId: session.user.id,
      action: 'order_created',
      entity: 'Order',
      entityId: order.id,
    })

    return NextResponse.json(order)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao registrar venda' }, { status: 500 })
  }
}
