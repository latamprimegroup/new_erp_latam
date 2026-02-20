import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'COMMERCIAL']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') || String(new Date().getMonth() + 1)
  const year = searchParams.get('year') || String(new Date().getFullYear())
  const start = new Date(parseInt(year), parseInt(month) - 1, 1)
  const end = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59)

  const [
    productionByMonth,
    stockByStatus,
    salesByClient,
    withdrawalsByGateway,
  ] = await Promise.all([
    prisma.productionAccount.groupBy({
      by: ['platform'],
      where: { createdAt: { gte: start, lte: end } },
      _count: { id: true },
    }),
    prisma.stockAccount.groupBy({
      by: ['status'],
      _count: { id: true },
    }),
    prisma.order.groupBy({
      by: ['clientId'],
      where: { status: 'DELIVERED', createdAt: { gte: start, lte: end } },
      _sum: { value: true },
      _count: { id: true },
    }),
    prisma.withdrawal.groupBy({
      by: ['gateway'],
      where: { createdAt: { gte: start, lte: end } },
      _sum: { netValue: true },
      _count: { id: true },
    }),
  ])

  const clientIds = salesByClient.map((s) => s.clientId)
  const clients = await prisma.clientProfile.findMany({
    where: { id: { in: clientIds } },
    include: { user: { select: { name: true, email: true } } },
  })
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c.user.name || c.user.email]))

  return NextResponse.json({
    production: productionByMonth.map((p) => ({ platform: p.platform, count: p._count.id })),
    stock: stockByStatus.map((s) => ({ status: s.status, count: s._count.id })),
    sales: salesByClient.map((s) => ({
      client: clientMap[s.clientId] || '—',
      total: Number(s._sum.value ?? 0),
      orders: s._count.id,
    })),
    withdrawals: withdrawalsByGateway.map((w) => ({
      gateway: w.gateway,
      total: Number(w._sum.netValue ?? 0),
      count: w._count.id,
    })),
    period: { month, year },
  })
}
