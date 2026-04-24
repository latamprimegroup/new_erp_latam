import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSalesManagerAccess, resolveManagedSellerIds } from '@/lib/commercial-hierarchy'
import { getMonthlyWindowUtc, getUserRevenueForMonth } from '@/lib/incentive-engine'

function parseMonthYear(searchParams: URLSearchParams) {
  const now = new Date()
  const month = Math.min(12, Math.max(1, parseInt(searchParams.get('month') || `${now.getMonth() + 1}`, 10) || now.getMonth() + 1))
  const year = Math.max(2020, Math.min(2100, parseInt(searchParams.get('year') || `${now.getFullYear()}`, 10) || now.getFullYear()))
  return { month, year }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
  const auth = await requireSalesManagerAccess()
  if (!auth.ok) return auth.response

  const { month, year } = parseMonthYear(new URL(req.url).searchParams)
  const { start, end } = getMonthlyWindowUtc(year, month)

  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: ['incentive_seller_goal_brl', 'incentive_seller_commission_pct', 'incentive_manager_override_pct'] } },
  })
  const m = Object.fromEntries(settings.map((s) => [s.key, s.value]))
  const sellerGoal = Number.parseFloat(m.incentive_seller_goal_brl ?? '30000')
  const sellerPct = Number.parseFloat(m.incentive_seller_commission_pct ?? '5')
  const managerPct = Number.parseFloat(m.incentive_manager_override_pct ?? '1')

  const scope = await resolveManagedSellerIds(auth.session.user.id, auth.session.user.role || '')
  if (scope.type === 'none') {
    return NextResponse.json({
      month,
      year,
      sellerGoalBrl: sellerGoal,
      sellerCommissionPct: sellerPct,
      managerOverridePct: managerPct,
      teamGrossBrl: 0,
      managerOverrideBrl: 0,
      sellers: [],
    })
  }
  const sellerIds =
    scope.type === 'all'
      ? (
          await prisma.user.findMany({
            where: { role: 'COMMERCIAL' },
            select: { id: true },
          })
        ).map((u) => u.id)
      : scope.sellerIds

  const details = await Promise.all(
    sellerIds.map(async (sellerId: string) => {
      const sellerSummary = await getUserRevenueForMonth(sellerId, start, end)
      const gross = sellerSummary.grossBrl
      const metaHit = gross >= sellerGoal
      const commissionToPay = metaHit ? round2((gross * sellerPct) / 100) : 0

      const user = await prisma.user.findUnique({
        where: { id: sellerId },
        select: { name: true, email: true },
      })

      return {
        sellerId,
        sellerName: user?.name || user?.email || 'N/A',
        totalVendidoBrl: gross,
        metaBatida: metaHit,
        comissaoPagarBrl: commissionToPay,
        pedidos: sellerSummary.ordersCount + sellerSummary.quickSalesCount,
      }
    })
  )

  const teamGross = details.reduce((sum: number, d) => sum + d.totalVendidoBrl, 0)
  const overrideBrl = round2((teamGross * managerPct) / 100)

  return NextResponse.json({
    month,
    year,
    sellerGoalBrl: sellerGoal,
    sellerCommissionPct: sellerPct,
    managerOverridePct: managerPct,
    teamGrossBrl: teamGross,
    managerOverrideBrl: overrideBrl,
    sellers: details.sort((a, b) => b.totalVendidoBrl - a.totalVendidoBrl),
  })
  } catch (err) {
    console.error('[manager/comissoes-payday] Erro:', err)
    return NextResponse.json({ error: 'Erro ao calcular comissões', sellers: [], teamGrossBrl: 0, managerOverrideBrl: 0 }, { status: 500 })
  }
}

