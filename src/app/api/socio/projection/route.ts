/**
 * GET /api/socio/projection
 * Projeção de Bilhão:
 *   - Taxa de crescimento atual (baseada nos últimos 6 meses)
 *   - Meses até atingir R$ 1M/mês → R$ 10M/mês → R$ 83M/mês (bilhão/ano)
 *   - Projeção de equity da empresa com múltiplo EBITDA
 *   - Projeção do patrimônio pessoal do sócio
 *   - Cenários: Conservador, Base, Agressivo
 */
import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'

// Dado um ponto inicial e taxa mensal, retorna array de 48 meses
function project(start: number, monthlyGrowthRate: number, months: number) {
  const pts: { month: number; value: number }[] = []
  let v = start
  for (let i = 0; i <= months; i++) { pts.push({ month: i, value: Math.round(v) }); v = v * (1 + monthlyGrowthRate) }
  return pts
}

function monthsToReach(start: number, target: number, rate: number): number | null {
  if (rate <= 0 || start <= 0) return null
  if (start >= target) return 0
  return Math.ceil(Math.log(target / start) / Math.log(1 + rate))
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const now   = new Date()
  const cfg   = await prisma.companyConfig.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } })

  // ── Histórico de receita mensal (últimos 6 meses) ─────────────────────────
  const history: { month: string; revenue: number; expense: number; profit: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d    = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const dEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const [inc, exp] = await Promise.all([
      prisma.financialEntry.aggregate({ where: { type: 'INCOME',  date: { gte: d, lt: dEnd } }, _sum: { value: true } }),
      prisma.financialEntry.aggregate({ where: { type: 'EXPENSE', date: { gte: d, lt: dEnd } }, _sum: { value: true } }),
    ])
    const revenue = Number(inc._sum.value ?? 0)
    const expense = Number(exp._sum.value ?? 0)
    history.push({ month: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }), revenue, expense, profit: revenue - expense })
  }

  // ── Taxa de crescimento mensal real ───────────────────────────────────────
  const revenues = history.map((h) => h.revenue).filter((v) => v > 0)
  let realGrowthRate = 0
  if (revenues.length >= 2) {
    const first = revenues[0]; const last = revenues[revenues.length - 1]
    if (first > 0 && last > 0) {
      realGrowthRate = Math.pow(last / first, 1 / (revenues.length - 1)) - 1
    }
  }

  const currentRevenue = revenues[revenues.length - 1] ?? 0
  const currentProfit  = history[history.length - 1]?.profit ?? 0

  // ── Cenários de crescimento ───────────────────────────────────────────────
  const SCENARIOS = {
    conservative: Math.max(0.03, realGrowthRate * 0.5),  // 3% mín ou metade do atual
    base:         Math.max(0.05, realGrowthRate),          // taxa atual
    aggressive:   Math.max(0.10, realGrowthRate * 1.5),   // 10% mín ou 1.5× atual
  }

  const MILESTONES = [
    { label: 'R$ 1M/mês',    value: 1_000_000   },
    { label: 'R$ 5M/mês',    value: 5_000_000   },
    { label: 'R$ 10M/mês',   value: 10_000_000  },
    { label: 'R$ 83M/mês',   value: 83_333_333  }, // ~1B/ano
    { label: 'R$ 1B/ano',    value: 83_333_333  },
  ]

  function buildScenario(rate: number) {
    const pts      = project(Math.max(currentRevenue, 1), rate, 48)
    const timeline = MILESTONES.map((m) => ({
      ...m,
      monthsToReach:  monthsToReach(currentRevenue, m.value, rate),
      alreadyReached: currentRevenue >= m.value,
    }))
    const taxPct     = Number(cfg.taxProvisionPct)
    const taxFactor  = taxPct === 0 ? 1 : (1 - taxPct / 100)
    const equityIn48 = (pts[48]?.value ?? 0) * taxFactor * 0.3 * cfg.ebitdaMultiple * 12
    return { rate: parseFloat((rate * 100).toFixed(2)), points: pts, timeline, equityIn48 }
  }

  const scenarios = {
    conservative: buildScenario(SCENARIOS.conservative),
    base:         buildScenario(SCENARIOS.base),
    aggressive:   buildScenario(SCENARIOS.aggressive),
  }

  // ── Patrimônio pessoal do sócio (para incluir no gráfico) ────────────────
  const socioProfile = await prisma.socioProfile.findUnique({
    where:   { userId: session.user.id },
    include: { assets: true },
  })
  const currentPatrimonio = (socioProfile?.assets ?? []).reduce((s, a) => s + Number(a.currentValue), 0)

  // ── Projeção de equity da empresa ─────────────────────────────────────────
  const currentEquity = Math.max(0, currentProfit) * 12 * cfg.ebitdaMultiple

  return NextResponse.json({
    currentRevenue,
    currentProfit,
    currentEquity,
    currentPatrimonio,
    realGrowthRatePct: parseFloat((realGrowthRate * 100).toFixed(2)),
    history,
    scenarios,
    config: {
      ebitdaMultiple:  cfg.ebitdaMultiple,
      revenueTarget:   Number(cfg.revenueTarget),
    },
    milestones: MILESTONES.map((m) => ({
      ...m,
      monthsBase:         monthsToReach(currentRevenue, m.value, SCENARIOS.base),
      monthsConservative: monthsToReach(currentRevenue, m.value, SCENARIOS.conservative),
      monthsAggressive:   monthsToReach(currentRevenue, m.value, SCENARIOS.aggressive),
    })),
  })
}
