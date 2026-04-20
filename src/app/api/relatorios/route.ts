import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'COMMERCIAL', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') || String(new Date().getMonth() + 1)
  const year = searchParams.get('year') || String(new Date().getFullYear())
  const start = new Date(parseInt(year), parseInt(month) - 1, 1)
  const end = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59)

  const paidOrderStatuses = ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] as const

  const [
    productionByMonth,
    stockByStatus,
    salesByClient,
    withdrawalsByGateway,
  ] = await Promise.all([
    // Ativos que entraram no estoque no mês (fluxo legado + G2), alinhado ao relatório diário
    prisma.stockAccount.groupBy({
      by: ['platform'],
      where: {
        deletedAt: null,
        source: { in: ['PRODUCTION', 'PRODUCTION_G2'] },
        createdAt: { gte: start, lte: end },
      },
      _count: { id: true },
    }),
    // Snapshot do inventário ativo (fora de vault / não apagado)
    prisma.stockAccount.groupBy({
      by: ['status'],
      where: { deletedAt: null, archivedAt: null },
      _count: { id: true },
    }),
    prisma.order.groupBy({
      by: ['clientId'],
      where: {
        status: { in: [...paidOrderStatuses] },
        paidAt: { gte: start, lte: end },
      },
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
