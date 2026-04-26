/**
 * GET /api/admin/sell-through
 *
 * Dashboard de Velocidade de Venda (Sell-Through Rate).
 * Mostra por categoria:
 *   - Estoque atual disponível
 *   - Taxa de venda/dia (média dos últimos 7 dias)
 *   - Dias de cobertura restante
 *   - Alert quando < 3 dias de cobertura
 *   - Produto mais vendido de cada categoria
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { subDays } from 'date-fns'

export const dynamic = 'force-dynamic'

const ALERT_DAYS  = 3   // alerta quando cobertura < X dias
const LOOKBACK    = 7   // dias para calcular velocidade

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!['ADMIN', 'CEO', 'COMMERCIAL', 'PRODUCTION_MANAGER'].includes(role ?? '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const since = subDays(new Date(), LOOKBACK)

  // 1. Estoque disponível por categoria
  const stockByCategory = await prisma.asset.groupBy({
    by:    ['category'],
    where: { status: 'AVAILABLE' },
    _count: { id: true },
  })

  // 2. Vendas por categoria nos últimos 7 dias (via QuickSaleCheckout PAID)
  const salesRaw = await prisma.quickSaleCheckout.findMany({
    where: {
      status: 'PAID',
      paidAt: { gte: since },
    },
    select: {
      qty:     true,
      paidAt:  true,
      listing: { select: { assetCategory: true } },
    },
  })

  // Agrega vendas por categoria
  const salesByCategory = new Map<string, { units: number; revenue: number; days: Set<string> }>()
  for (const sale of salesRaw) {
    const cat = sale.listing.assetCategory
    if (!salesByCategory.has(cat)) {
      salesByCategory.set(cat, { units: 0, revenue: 0, days: new Set() })
    }
    const s = salesByCategory.get(cat)!
    s.units += sale.qty
    if (sale.paidAt) s.days.add(sale.paidAt.toISOString().split('T')[0])
  }

  // 3. Produto mais vendido por categoria
  const topByCategory = await prisma.quickSaleCheckout.groupBy({
    by:    ['listingId'],
    where: {
      status: 'PAID',
      paidAt: { gte: since },
    },
    _sum:  { qty: true },
    orderBy: { _sum: { qty: 'desc' } },
  })

  const listingIds = topByCategory.map((r) => r.listingId)
  const listings   = await prisma.productListing.findMany({
    where: { id: { in: listingIds } },
    select: { id: true, title: true, assetCategory: true },
  })
  const listingMap = new Map(listings.map((l) => [l.id, l]))

  // Top por categoria
  const topPerCategory = new Map<string, { title: string; units: number }>()
  for (const row of topByCategory) {
    const listing = listingMap.get(row.listingId)
    if (!listing) continue
    if (!topPerCategory.has(listing.assetCategory)) {
      topPerCategory.set(listing.assetCategory, {
        title: listing.title,
        units: row._sum.qty ?? 0,
      })
    }
  }

  // 4. Monta resultado
  const categories = new Set([
    ...stockByCategory.map((s) => s.category as string),
    ...Array.from(salesByCategory.keys()),
  ])

  const items = Array.from(categories).map((cat) => {
    const available = stockByCategory.find((s) => s.category === cat)?._count.id ?? 0
    const sales     = salesByCategory.get(cat) ?? { units: 0, revenue: 0, days: new Set<string>() }
    const daysActive = Math.max(1, sales.days.size || 1)
    const dailyRate  = sales.units / LOOKBACK   // média por dia corrido
    const daysLeft   = dailyRate > 0 ? available / dailyRate : (available > 0 ? 999 : 0)
    const alert      = daysLeft < ALERT_DAYS && available > 0
    const top        = topPerCategory.get(cat) ?? null

    return {
      category:       cat,
      categoryLabel:  cat.replace('_ADS', ' Ads').replace('_', ' '),
      available,
      soldLast7d:     sales.units,
      dailyRate:      Math.round(dailyRate * 10) / 10,
      daysOfCoverage: daysLeft >= 999 ? null : Math.round(daysLeft * 10) / 10,
      alert,
      topProduct:     top,
    }
  }).sort((a, b) => b.soldLast7d - a.soldLast7d)

  const totalAvailable = items.reduce((s, i) => s + i.available, 0)
  const totalSold7d    = items.reduce((s, i) => s + i.soldLast7d, 0)
  const alertCount     = items.filter((i) => i.alert).length

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    lookbackDays: LOOKBACK,
    summary: { totalAvailable, totalSold7d, alertCount, dailyAvgAll: Math.round(totalSold7d / LOOKBACK * 10) / 10 },
    items,
  })
}
