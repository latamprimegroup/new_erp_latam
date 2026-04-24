/**
 * GET /api/compras/war-room
 * BI executivo do War Room OS — apenas ADMIN.
 *
 * Retorna:
 *  - kpis: faturamento/lucro do mês corrente e acumulado
 *  - vendorRanking: fornecedores ordenados por LTV real (margem – custo RMA)
 *  - lowStockAlerts: categorias com < LOW_STOCK_THRESHOLD ativos disponíveis
 *  - topBuyers: top 5 clientes por gasto total
 *  - recentSales: últimas 15 vendas (para o feed de atividade)
 *  - assets: todos os ativos com dados completos (visão CEO)
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const LOW_STOCK_THRESHOLD = 5

export async function GET() {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN')
    return NextResponse.json({ error: 'Apenas ADMIN' }, { status: 403 })

  const now       = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const yearStart  = new Date(now.getFullYear(), 0, 1)

  // ── 1. KPIs financeiros ───────────────────────────────────────────────────
  const [soldMonth, soldYear, soldAll, availableAll] = await Promise.all([
    prisma.asset.aggregate({
      _sum:   { salePrice: true, costPrice: true },
      _count: { id: true },
      where:  { status: 'SOLD', soldAt: { gte: monthStart } },
    }),
    prisma.asset.aggregate({
      _sum:   { salePrice: true, costPrice: true },
      _count: { id: true },
      where:  { status: 'SOLD', soldAt: { gte: yearStart } },
    }),
    prisma.asset.aggregate({
      _sum:   { salePrice: true, costPrice: true },
      _count: { id: true },
      where:  { status: 'SOLD' },
    }),
    prisma.asset.aggregate({
      _sum:   { salePrice: true, costPrice: true },
      _count: { id: true },
      where:  { status: 'AVAILABLE' },
    }),
  ])

  const revenueMonth  = Number(soldMonth._sum.salePrice  ?? 0)
  const costMonth     = Number(soldMonth._sum.costPrice   ?? 0)
  const revenueYear   = Number(soldYear._sum.salePrice   ?? 0)
  const costYear      = Number(soldYear._sum.costPrice    ?? 0)
  const revenueAll    = Number(soldAll._sum.salePrice    ?? 0)
  const costAll       = Number(soldAll._sum.costPrice     ?? 0)
  const stockValue    = Number(availableAll._sum.salePrice ?? 0)
  const stockCost     = Number(availableAll._sum.costPrice ?? 0)

  const kpis = {
    month: {
      revenue:    revenueMonth,
      cost:       costMonth,
      profit:     revenueMonth - costMonth,
      margin:     revenueMonth > 0 ? Math.round(((revenueMonth - costMonth) / revenueMonth) * 100) : 0,
      count:      soldMonth._count.id,
    },
    year: {
      revenue:    revenueYear,
      profit:     revenueYear - costYear,
      count:      soldYear._count.id,
    },
    all: {
      revenue:    revenueAll,
      profit:     revenueAll - costAll,
      count:      soldAll._count.id,
    },
    stock: {
      value:      stockValue,
      cost:       stockCost,
      margin:     stockValue - stockCost,
      count:      availableAll._count.id,
    },
  }

  // ── 2. Ranking de Fornecedores (LTV real) ─────────────────────────────────
  const vendors = await prisma.vendor.findMany({
    include: {
      assets: {
        select: { id: true, status: true, costPrice: true, salePrice: true, soldAt: true },
      },
      rmaTickets: {
        select: {
          id: true, isVendorFault: true, replacementCost: true,
          hoursAfterDelivery: true, withinWarranty: true, status: true,
        },
      },
    },
  })

  const vendorRanking = vendors.map((v) => {
    const totalAssets     = v.assets.length
    const soldAssets      = v.assets.filter((a) => a.status === 'SOLD' || a.status === 'DELIVERED')
    const revenue         = soldAssets.reduce((s, a) => s + Number(a.salePrice), 0)
    const cost            = v.assets.reduce((s, a) => s + Number(a.costPrice), 0)
    const rmaCount        = v.rmaTickets.length
    const vendorFaultRma  = v.rmaTickets.filter((r) => r.isVendorFault).length
    const rmaLoss         = v.rmaTickets.reduce((s, r) => s + Number(r.replacementCost ?? 0), 0)
    const realProfit      = revenue - cost - rmaLoss
    const faultRate       = totalAssets > 0 ? Math.round((vendorFaultRma / totalAssets) * 100) : 0
    const avgSurvivalHours = v.rmaTickets.length > 0
      ? Math.round(v.rmaTickets.reduce((s, r) => s + (r.hoursAfterDelivery ?? 0), 0) / v.rmaTickets.length)
      : null
    const healthScore = Math.max(0, 100 - faultRate * 2 - (rmaCount > 5 ? 10 : 0))

    return {
      id:               v.id,
      name:             v.name,
      category:         v.category,
      totalAssets,
      soldCount:        soldAssets.length,
      revenue,
      cost,
      rmaCount,
      vendorFaultRma,
      faultRate,
      rmaLoss,
      realProfit,
      avgSurvivalHours,
      healthScore,
      rating:           v.rating,
    }
  }).sort((a, b) => b.realProfit - a.realProfit)

  // ── 3. Alertas de estoque baixo ───────────────────────────────────────────
  const byCategory = await prisma.asset.groupBy({
    by:    ['category'],
    _count: { id: true },
    where: { status: 'AVAILABLE' },
  })

  const lowStockAlerts = byCategory
    .filter((g) => g._count.id < LOW_STOCK_THRESHOLD)
    .map((g) => ({ category: g.category, count: g._count.id }))
    .sort((a, b) => a.count - b.count)

  // ── 4. Top Compradores ────────────────────────────────────────────────────
  const topBuyers = await prisma.clientProfile.findMany({
    where:   { totalAccountsBought: { gt: 0 } },
    orderBy: { totalSpent: 'desc' },
    take:    8,
    select: {
      id: true,
      clientCode: true,
      totalSpent: true,
      totalAccountsBought: true,
      refundCount: true,
      reputationScore: true,
      lastPurchaseAt: true,
      user: { select: { name: true, email: true } },
    },
  })

  // ── 5. Feed de vendas recentes ────────────────────────────────────────────
  const recentSales = await prisma.asset.findMany({
    where:   { status: 'SOLD', soldAt: { not: null } },
    orderBy: { soldAt: 'desc' },
    take:    15,
    select: {
      id: true, adsId: true, category: true, displayName: true,
      salePrice: true, costPrice: true, soldAt: true,
      vendor: { select: { name: true } },
      movements: {
        where:   { toStatus: 'SOLD' },
        orderBy: { createdAt: 'desc' },
        take:    1,
        select:  { reason: true },
      },
    },
  })

  // ── 6. Tabela CEO completa (ativos disponíveis) ───────────────────────────
  const assets = await prisma.asset.findMany({
    orderBy: { createdAt: 'desc' },
    take:    200,
    select: {
      id: true, adsId: true, category: true, subCategory: true,
      status: true, salePrice: true, costPrice: true, displayName: true,
      tags: true, specs: true, createdAt: true, soldAt: true,
      vendor: { select: { id: true, name: true } },
      _count: { select: { rmaAsOriginal: true } },
    },
  })

  return NextResponse.json({
    kpis,
    vendorRanking,
    lowStockAlerts,
    topBuyers: topBuyers.map((b) => ({
      id:            b.id,
      code:          b.clientCode,
      name:          b.user?.name ?? 'Sem nome',
      email:         b.user?.email ?? '',
      totalSpent:    Number(b.totalSpent ?? 0),
      totalAccounts: b.totalAccountsBought,
      refundCount:   b.refundCount,
      reputation:    b.reputationScore,
      lastPurchase:  b.lastPurchaseAt,
      avgTicket:     b.totalAccountsBought > 0
        ? Number(b.totalSpent ?? 0) / b.totalAccountsBought
        : 0,
      tier: b.totalAccountsBought >= 20 ? 'PARTNER'
          : b.totalAccountsBought >= 6  ? 'VIP'
          : 'VAREJO',
    })),
    recentSales: recentSales.map((s) => ({
      id:          s.id,
      adsId:       s.adsId,
      category:    s.category,
      displayName: s.displayName,
      salePrice:   Number(s.salePrice),
      costPrice:   Number(s.costPrice),
      profit:      Number(s.salePrice) - Number(s.costPrice),
      soldAt:      s.soldAt,
      vendor:      s.vendor?.name ?? '—',
      buyer:       s.movements[0]?.reason?.replace('Vendido para: ', '') ?? '—',
    })),
    assets: assets.map((a) => ({
      id:          a.id,
      adsId:       a.adsId,
      category:    a.category,
      subCategory: a.subCategory,
      status:      a.status,
      displayName: a.displayName,
      salePrice:   Number(a.salePrice),
      costPrice:   Number(a.costPrice),
      profit:      Number(a.salePrice) - Number(a.costPrice),
      margin:      Number(a.salePrice) > 0
        ? Math.round(((Number(a.salePrice) - Number(a.costPrice)) / Number(a.salePrice)) * 100)
        : 0,
      tags:        a.tags,
      specs:       a.specs,
      createdAt:   a.createdAt,
      soldAt:      a.soldAt,
      vendor:      a.vendor?.name ?? '—',
      vendorId:    a.vendor?.id ?? '',
      rmaCount:    a._count.rmaAsOriginal,
    })),
    generatedAt: new Date().toISOString(),
  })
}
