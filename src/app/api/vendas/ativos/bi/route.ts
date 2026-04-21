/**
 * GET /api/vendas/ativos/bi
 * CEO Dashboard — Margem Real, Ranking de Fornecedores, Volume de Vendas
 *
 * Acessível apenas para ADMIN e FINANCE.
 * Queries otimizadas com agregações no banco.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED = ['ADMIN', 'FINANCE', 'PURCHASING']

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const now   = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const week  = new Date(today.getTime() - 7 * 86400000)
  const month = new Date(now.getFullYear(), now.getMonth(), 1)

  // ── Margem e Volume de Vendas ─────────────────────────────────────────────
  const [todayOrders, weekOrders, monthOrders, allTime] = await Promise.all([
    prisma.assetSalesOrder.aggregate({
      where:  { status: { in: ['DELIVERED', 'DELIVERING'] }, deliveredAt: { gte: today } },
      _sum:   { grossMargin: true, negotiatedPrice: true, costSnapshot: true },
      _count: true,
    }),
    prisma.assetSalesOrder.aggregate({
      where:  { status: { in: ['DELIVERED', 'DELIVERING'] }, deliveredAt: { gte: week } },
      _sum:   { grossMargin: true, negotiatedPrice: true, costSnapshot: true },
      _count: true,
    }),
    prisma.assetSalesOrder.aggregate({
      where:  { status: { in: ['DELIVERED', 'DELIVERING'] }, deliveredAt: { gte: month } },
      _sum:   { grossMargin: true, negotiatedPrice: true, costSnapshot: true },
      _count: true,
    }),
    prisma.assetSalesOrder.aggregate({
      where: { status: { in: ['DELIVERED', 'DELIVERING'] } },
      _sum:  { grossMargin: true, negotiatedPrice: true, costSnapshot: true },
      _count: true,
    }),
  ])

  // ── Ranking de Fornecedores ───────────────────────────────────────────────
  // Cruza: Vendas entregues → Ativo → Vendor
  const soldAssets = await prisma.assetSalesOrder.findMany({
    where:   { status: { in: ['DELIVERED', 'DELIVERING'] } },
    select:  { negotiatedPrice: true, costSnapshot: true, grossMargin: true, deliveredAt: true, asset: { select: { vendorId: true } } },
  })

  const vendorMap: Record<string, { revenue: number; cost: number; margin: number; count: number }> = {}
  for (const o of soldAssets) {
    const vid = (o.asset as { vendorId: string }).vendorId
    if (!vendorMap[vid]) vendorMap[vid] = { revenue: 0, cost: 0, margin: 0, count: 0 }
    vendorMap[vid].revenue += Number(o.negotiatedPrice)
    vendorMap[vid].cost    += Number(o.costSnapshot)
    vendorMap[vid].margin  += Number(o.grossMargin)
    vendorMap[vid].count   += 1
  }

  const vendorIds = Object.keys(vendorMap)
  const vendors   = vendorIds.length
    ? await prisma.vendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true, category: true, rating: true } })
    : []

  // Assets mortos (DEAD) por fornecedor — taxa de falha
  const deadAssets = await prisma.asset.groupBy({ by: ['vendorId'], _count: true, where: { status: 'DEAD', vendorId: { in: vendorIds } } })
  const deadMap    = Object.fromEntries(deadAssets.map((d) => [d.vendorId, d._count]))

  // Total de ativos por fornecedor (para calcular % de falha)
  const totalByVendor = await prisma.asset.groupBy({ by: ['vendorId'], _count: true, where: { vendorId: { in: vendorIds } } })
  const totalMap      = Object.fromEntries(totalByVendor.map((t) => [t.vendorId, t._count]))

  const vendorRanking = vendors.map((v) => {
    const stats     = vendorMap[v.id] ?? { revenue: 0, cost: 0, margin: 0, count: 0 }
    const dead      = deadMap[v.id]   ?? 0
    const total     = totalMap[v.id]  ?? 1
    const failRate  = (dead / total) * 100
    const marginPct = stats.revenue > 0 ? (stats.margin / stats.revenue) * 100 : 0
    // Health Score: margem alta + falha baixa = melhor
    const healthScore = Math.round(marginPct - failRate * 2)
    return { ...v, ...stats, dead, total, failRate: Math.round(failRate * 10) / 10, marginPct: Math.round(marginPct * 10) / 10, healthScore }
  }).sort((a, b) => b.healthScore - a.healthScore)

  // ── Pipeline de OS (por status) ───────────────────────────────────────────
  const pipeline = await prisma.assetSalesOrder.groupBy({ by: ['status'], _count: true })

  // ── Top Vendedores ────────────────────────────────────────────────────────
  const sellerStats = await prisma.assetSalesOrder.groupBy({
    by:     ['sellerId'],
    _count: true,
    _sum:   { negotiatedPrice: true, grossMargin: true },
    where:  { status: { in: ['DELIVERED', 'DELIVERING', 'CLIENT_PAID', 'VENDOR_PAID'] } },
    orderBy: { _sum: { grossMargin: 'desc' } },
    take:   10,
  })

  const sellerIds   = sellerStats.map((s) => s.sellerId)
  const sellerUsers = sellerIds.length
    ? await prisma.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true, email: true } })
    : []
  const sellerMap2  = Object.fromEntries(sellerUsers.map((u) => [u.id, u]))

  const topSellers = sellerStats.map((s) => ({
    user:        sellerMap2[s.sellerId] ?? { id: s.sellerId, name: 'Desconhecido', email: '' },
    count:       s._count,
    totalRevenue: Number(s._sum.negotiatedPrice ?? 0),
    totalMargin:  Number(s._sum.grossMargin ?? 0),
  }))

  const fmt = (agg: typeof todayOrders) => ({
    count:       agg._count,
    revenue:     Number(agg._sum.negotiatedPrice ?? 0),
    cost:        Number(agg._sum.costSnapshot    ?? 0),
    grossMargin: Number(agg._sum.grossMargin     ?? 0),
    marginPct:   Number(agg._sum.negotiatedPrice ?? 0) > 0
      ? Math.round((Number(agg._sum.grossMargin ?? 0) / Number(agg._sum.negotiatedPrice ?? 1)) * 1000) / 10
      : 0,
  })

  return NextResponse.json({
    volume:         { today: fmt(todayOrders), week: fmt(weekOrders), month: fmt(monthOrders), allTime: fmt(allTime) },
    vendorRanking,
    pipeline:       Object.fromEntries(pipeline.map((p) => [p.status, p._count])),
    topSellers,
  })
}
