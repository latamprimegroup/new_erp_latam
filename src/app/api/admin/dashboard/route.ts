import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)

  const g2NotRemoved = { archivedAt: null, deletedAt: null } as const

  const [
    usersCount,
    productionDailyPa,
    productionDailyG2,
    productionMonthlyPa,
    productionMonthlyG2,
    stockCritical,
    ordersPending,
    ordersCompleted,
    deliveriesDelayedOrder,
    deliveriesDelayedGroup,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.productionAccount.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.productionG2.count({ where: { createdAt: { gte: startOfDay }, ...g2NotRemoved } }),
    prisma.productionAccount.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.productionG2.count({ where: { createdAt: { gte: startOfMonth }, ...g2NotRemoved } }),
    prisma.stockAccount.count({ where: { status: 'CRITICAL' } }),
    prisma.order.count({ where: { status: { in: ['PENDING', 'AWAITING_PAYMENT', 'PAID', 'IN_DELIVERY', 'IN_SEPARATION'] } } }),
    prisma.order.count({ where: { status: 'DELIVERED' } }),
    prisma.delivery.count({ where: { status: 'DELAYED' } }),
    prisma.deliveryGroup.count({ where: { status: 'ATRASADA' } }),
  ])

  const productionDaily = productionDailyPa + productionDailyG2
  const productionMonthly = productionMonthlyPa + productionMonthlyG2
  const deliveriesDelayed = deliveriesDelayedOrder + deliveriesDelayedGroup

  const income = prisma.financialEntry.aggregate({
    where: { type: 'INCOME', date: { gte: startOfMonth } },
    _sum: { value: true },
  })
  const expense = prisma.financialEntry.aggregate({
    where: { type: 'EXPENSE', date: { gte: startOfMonth } },
    _sum: { value: true },
  })
  const [inc, exp] = await Promise.all([income, expense])

  const logs = await prisma.auditLog.findMany({
    take: 20,
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true, email: true } } },
  })

  return NextResponse.json({
    kpis: {
      users: usersCount,
      productionDaily,
      productionMonthly,
      stockCritical,
      ordersPending,
      ordersCompleted,
      deliveriesDelayed,
      financialIncome: Number(inc._sum.value ?? 0),
      financialExpense: Number(exp._sum.value ?? 0),
      financialBalance: Number(inc._sum.value ?? 0) - Number(exp._sum.value ?? 0),
    },
    alerts: [
      stockCritical > 0 && { type: 'critical', message: `${stockCritical} conta(s) em estoque crítico` },
      deliveriesDelayed > 0 && { type: 'warning', message: `${deliveriesDelayed} entrega(s) atrasada(s)` },
      ordersPending > 0 && { type: 'info', message: `${ordersPending} pedido(s) pendente(s)` },
    ].filter(Boolean),
    logs,
  })
}
