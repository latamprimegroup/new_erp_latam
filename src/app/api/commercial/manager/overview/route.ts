import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getIncentiveConfig, getTeamRevenueForMonth } from '@/lib/incentive-engine'
import { canManageCommercialTeam, getCommercialTeamScope } from '@/lib/commercial-hierarchy'

const PAID_STATUSES = ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] as const

function monthWindow(date = new Date()) {
  return {
    start: new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0),
    end: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999),
  }
}

function parseMonth(v: string | null): Date {
  if (!v) return new Date()
  const m = v.match(/^(\d{4})-(\d{2})$/)
  if (!m) return new Date()
  return new Date(Number(m[1]), Number(m[2]) - 1, 1)
}

type TeamRevenueShape = {
  grossBrl: number
  sellersCount: number
  sellers: Array<{ sellerId: string; sellerName: string; grossBrl: number }>
}

async function getCpaMedioEquipe(opts: {
  start: Date
  end: Date
  sellerIds: string[]
}): Promise<number | null> {
  if (opts.sellerIds.length === 0) return null

  try {
    const [paidOrders, paidQuick, campaignSpend] = await Promise.all([
      prisma.order.count({
        where: {
          sellerId: { in: opts.sellerIds },
          paidAt: { gte: opts.start, lte: opts.end },
          status: { in: [...PAID_STATUSES] },
        },
      }),
      prisma.quickSaleCheckout.count({
        where: {
          sellerId: { in: opts.sellerIds },
          paidAt: { gte: opts.start, lte: opts.end },
          status: 'PAID',
        },
      }),
      // Tabela opcional — pode não existir ainda em produção
      prisma.intelligenceCampaignSpend.aggregate({
        where: { periodMonth: { gte: opts.start, lte: opts.end } },
        _sum: { spendBrl: true },
      }).catch(() => ({ _sum: { spendBrl: 0 } })),
    ])

    const conversions = paidOrders + paidQuick
    if (conversions === 0) return null
    const spend = Number(campaignSpend._sum.spendBrl ?? 0)
    return Math.round((spend / conversions) * 100) / 100
  } catch {
    return null
  }
}

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !session.user.role) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!canManageCommercialTeam(session.user.role, session.user.cargo)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const monthRef = parseMonth(new URL(req.url).searchParams.get('month'))
  const { start, end } = monthWindow(monthRef)

  const scope = await getCommercialTeamScope(session.user.id, session.user.role, session.user.cargo)
  const teamRows = await prisma.user.findMany({
    where: {
      role: 'COMMERCIAL',
      ...(scope.allTeam
        ? {}
        : {
            OR: [{ leaderId: session.user.id }, ...(scope.includeSelf ? [{ id: session.user.id }] : [])],
          }),
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })

  const uniqueTeam = new Map<string, { id: string; name: string; email: string }>()
  for (const r of teamRows) {
    uniqueTeam.set(r.id, { id: r.id, name: r.name || r.email, email: r.email })
  }
  if (scope.includeSelf) {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true },
    })
    if (me) uniqueTeam.set(me.id, { id: me.id, name: me.name || me.email, email: me.email })
  }

  const sellers = [...uniqueTeam.values()]
  const sellerIds = sellers.map((s) => s.id)

  const [config, teamRevenue, cpaMedio, discountSetting] = await Promise.all([
    getIncentiveConfig(),
    scope.allTeam
      ? (async (): Promise<TeamRevenueShape> => {
          const sellersAll = await prisma.user.findMany({
            where: { role: 'COMMERCIAL' },
            select: { id: true, name: true, email: true },
          })
          const sellerRows = await Promise.all(
            sellersAll.map(async (s) => {
              const [oAgg, qAgg] = await Promise.all([
                prisma.order.aggregate({
                  where: {
                    sellerId: s.id,
                    paidAt: { gte: start, lte: end },
                    status: { in: [...PAID_STATUSES] },
                  },
                  _sum: { value: true },
                }),
                prisma.quickSaleCheckout.aggregate({
                  where: {
                    sellerId: s.id,
                    paidAt: { gte: start, lte: end },
                    status: 'PAID',
                  },
                  _sum: { totalAmount: true },
                }),
              ])
              return {
                sellerId: s.id,
                sellerName: s.name || s.email,
                grossBrl: Number(oAgg._sum.value ?? 0) + Number(qAgg._sum.totalAmount ?? 0),
              }
            })
          )
          return {
            grossBrl: sellerRows.reduce((sum, s) => sum + s.grossBrl, 0),
            sellersCount: sellerRows.length,
            sellers: sellerRows,
          }
        })()
      : getTeamRevenueForMonth(session.user.id, start, end),
    getCpaMedioEquipe({ start, end, sellerIds }),
    prisma.systemSetting.findUnique({ where: { key: 'commercial_manager_max_discount_pct' } }),
  ])

  const revenueBySeller = new Map(teamRevenue.sellers.map((s) => [s.sellerId, s.grossBrl]))
  const performers = sellers.map((s) => {
    const total = revenueBySeller.get(s.id) ?? 0
    const pct = config.sellerGoalBrl > 0 ? Math.min(100, Math.round((total / config.sellerGoalBrl) * 1000) / 10) : 0
    return {
      sellerId: s.id,
      sellerName: s.name,
      sellerEmail: s.email,
      totalBrl: total,
      goalBrl: config.sellerGoalBrl,
      progressPct: pct,
      unlocked: total >= config.sellerGoalBrl,
      remainingBrl: Math.max(0, Math.round((config.sellerGoalBrl - total) * 100) / 100),
    }
  }).sort((a, b) => b.totalBrl - a.totalBrl)

  const teamTotal = performers.reduce((sum, p) => sum + p.totalBrl, 0)
  const overrideValue = Math.round((teamTotal * (config.managerOverridePct / 100)) * 100) / 100

  return NextResponse.json({
    monthStart: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`,
    config: {
      sellerGoalBrl: config.sellerGoalBrl,
      sellerCommissionPct: config.sellerCommissionPct,
      managerOverridePct: config.managerOverridePct,
      maxDiscountPct: Number.parseFloat(discountSetting?.value ?? '15'),
    },
    team: {
      sellersCount: performers.length,
      totalRevenueBrl: teamTotal,
      cpaMedioBrl: cpaMedio,
      overrideValueBrl: overrideValue,
      performers,
    },
  })
  } catch (err) {
    console.error('[manager/overview] Erro:', err)
    return NextResponse.json({ error: 'Erro ao carregar overview do gerente' }, { status: 500 })
  }
}
