import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getIncentiveConfig, getTeamRevenueForMonth, getUserRevenueForMonth } from '@/lib/incentive-engine'
import { prisma } from '@/lib/prisma'

function startOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
}

function parseMonthInput(v: string | null): Date {
  if (!v) return new Date()
  const m = v.match(/^(\d{4})-(\d{2})$/)
  if (!m) return new Date()
  return new Date(Number(m[1]), Number(m[2]) - 1, 1)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !session.user.role) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (!['ADMIN', 'COMMERCIAL', 'FINANCE'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const monthDate = parseMonthInput(new URL(req.url).searchParams.get('month'))
  const start = startOfMonth(monthDate)
  const end = endOfMonth(monthDate)

  const config = await getIncentiveConfig()
  const threshold = config.sellerGoalBrl
  const overridePct = config.managerOverridePct

  const [summarySelf, teamSummary] = await Promise.all([
    getUserRevenueForMonth(session.user.id, start, end),
    session.user.role === 'COMMERCIAL'
      ? getTeamRevenueForMonth(session.user.id, start, end)
      : Promise.resolve(null),
  ])

  const topSellerIds = Array.from(
    new Set([
      session.user.role === 'COMMERCIAL' ? session.user.id : null,
      ...(teamSummary?.sellers ?? []).map((m) => m.sellerId),
    ].filter(Boolean))
  ) as string[]

  const [users, monthlyOrders, monthlyQuick] = topSellerIds.length
    ? await Promise.all([
        prisma.user.findMany({
          where: { id: { in: topSellerIds } },
          select: { id: true, name: true, email: true },
        }),
        prisma.order.findMany({
          where: {
            sellerId: { in: topSellerIds },
            paidAt: { gte: start, lte: end },
            status: { in: ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] },
          },
          select: { sellerId: true, value: true, sellerCommission: true, managerCommission: true, sellerMetaUnlocked: true },
        }),
        prisma.quickSaleCheckout.findMany({
          where: {
            sellerId: { in: topSellerIds },
            paidAt: { gte: start, lte: end },
            status: 'PAID',
          },
          select: { sellerId: true, totalAmount: true, sellerCommission: true, managerCommission: true, sellerMetaUnlocked: true },
        }),
      ])
    : [[], [], []]

  const userMap = Object.fromEntries(users.map((u) => [u.id, u.name || u.email]))
  const sellerMap = new Map<string, {
    approvedAmountBrl: number
    sellerCommissionBrl: number
    managerCommissionBrl: number
    unlocked: boolean
  }>()

  const upsertSellerTotals = (
    sellerId: string | null,
    gross: number,
    sellerCommission: number,
    managerCommission: number,
    unlocked: boolean | null
  ) => {
    if (!sellerId) return
    const curr = sellerMap.get(sellerId) ?? {
      approvedAmountBrl: 0,
      sellerCommissionBrl: 0,
      managerCommissionBrl: 0,
      unlocked: false,
    }
    curr.approvedAmountBrl += gross
    curr.sellerCommissionBrl += sellerCommission
    curr.managerCommissionBrl += managerCommission
    curr.unlocked = curr.unlocked || Boolean(unlocked)
    sellerMap.set(sellerId, curr)
  }

  for (const o of monthlyOrders) {
    upsertSellerTotals(
      o.sellerId,
      Number(o.value),
      Number(o.sellerCommission ?? 0),
      Number(o.managerCommission ?? 0),
      o.sellerMetaUnlocked
    )
  }
  for (const q of monthlyQuick) {
    upsertSellerTotals(
      q.sellerId,
      Number(q.totalAmount),
      Number(q.sellerCommission ?? 0),
      Number(q.managerCommission ?? 0),
      q.sellerMetaUnlocked
    )
  }

  const topSellers = [...sellerMap.entries()]
    .map(([sellerId, totals]) => ({
      sellerId,
      sellerName: userMap[sellerId] || 'N/A',
      approvedAmountBrl: totals.approvedAmountBrl,
      sellerCommissionBrl: totals.sellerCommissionBrl,
      managerCommissionBrl: totals.managerCommissionBrl,
      unlocked: totals.unlocked,
    }))
    .sort((a, b) => b.approvedAmountBrl - a.approvedAmountBrl)
    .slice(0, 5)

  return NextResponse.json({
    monthStart: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`,
    targetBrl: threshold,
    totalApprovedBrl: summarySelf.grossBrl,
    progressPct: threshold > 0 ? Math.min(100, Number(((summarySelf.grossBrl / threshold) * 100).toFixed(1))) : 0,
    remainingToUnlockBrl: Math.max(0, threshold - summarySelf.grossBrl),
    unlocked: summarySelf.grossBrl >= threshold,
    sellerCommissionPct: config.sellerCommissionPct,
    managerOverridePct: overridePct,
    productionUnitBonusBrl: config.productionBonusPerReadyAsset,
    productionManagerBonusBrl: config.productionManagerBonusPerReadyAsset,
    topSellers,
    me: summarySelf,
    team: teamSummary,
  })
}
