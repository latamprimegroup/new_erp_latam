/**
 * GET /api/admin/alfredo/scale
 *
 * Projeções de escala exponencial "Road to Bilhão":
 *  - 24 meses de projeção em 3 cenários (conservador / base / agressivo)
 *  - Eficiência por colaborador (Revenue / Team Size)
 *  - Precificação dinâmica: sugestões de markup baseadas em giro
 *  - Antifragilidade: ranking de vendors por LTV e taxa de falha
 *  - Reinvestimento: cálculo de impacto de % de lucro reinvestido
 */
import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'

export const runtime = 'nodejs'

const REVENUE_GOAL  = 1_000_000   // Meta mensal R$1M
const BILLION_YEAR  = 1_000_000_000 // R$1 bilhão anual = R$83.3M/mês

// ── Projeção composta ─────────────────────────────────────────────────────────

function projectRevenue(base: number, monthlyGrowthRate: number, months: number): number[] {
  const arr = [base]
  for (let i = 1; i <= months; i++) arr.push(arr[i - 1] * (1 + monthlyGrowthRate))
  return arr
}

function monthsToTarget(base: number, rate: number, target: number): number {
  if (base >= target) return 0
  let m = 0; let v = base
  while (v < target && m < 240) { v *= (1 + rate); m++ }
  return m
}

// ── Giro de ativos (velocity) ─────────────────────────────────────────────────

async function getAssetVelocity() {
  const d30 = new Date(Date.now() - 30 * 86400_000)

  const [sold30, available, vendors] = await Promise.all([
    prisma.assetSalesOrder.count({ where: { createdAt: { gte: d30 }, status: { not: 'CANCELED' } } }),
    prisma.asset.findMany({
      where:  { status: 'AVAILABLE' },
      select: { id: true, salePrice: true, costPrice: true, markupPct: true, category: true, vendorId: true, updatedAt: true },
      take:   200,
    }),
    prisma.vendor.findMany({
      where:  { active: true },
      select: { id: true, name: true, rating: true },
    }),
  ])

  // Giro diário: vendas / 30 dias
  const dailyVelocity = sold30 / 30

  // Ativos parados há muito tempo → candidatos a oferta relâmpago
  const now   = Date.now()
  const flash  = available.filter((a) => now - a.updatedAt.getTime() > 21 * 86400_000)
  const hot    = available.filter((a) => now - a.updatedAt.getTime() < 7  * 86400_000)

  // Sugestões de markup dinâmico
  const pricingSuggestions = []
  if (dailyVelocity > 2 && available.length < 20) {
    pricingSuggestions.push({
      type: 'INCREASE',
      message: `Alta demanda (${dailyVelocity.toFixed(1)} vendas/dia) com estoque baixo (${available.length}). Aumentar markup em +10%.`,
      impact:  `+${(available.length * 2000 * 0.1).toFixed(0)} de margem adicional`,
    })
  }
  if (flash.length > 5) {
    pricingSuggestions.push({
      type: 'FLASH_SALE',
      message: `${flash.length} ativos parados >21 dias. Oferta relâmpago com -15% acelera giro e libera caixa.`,
      impact:  `-R$${Math.round(flash.reduce((s, a) => s + Number(a.salePrice ?? 0) * 0.15, 0)).toLocaleString('pt-BR')} de desconto → +${Math.round(flash.length * 0.6)} vendas estimadas`,
    })
  }
  if (pricingSuggestions.length === 0) {
    pricingSuggestions.push({
      type: 'STABLE',
      message: 'Pricing equilibrado. Monitorar por mais 7 dias antes de ajustar.',
      impact:  'Manter markup atual',
    })
  }

  // Antifragilidade: vendors com mais ativos disponíveis (proxy de saúde)
  const vendorMap = Object.fromEntries(vendors.map((v) => [v.id, v]))
  const vendorAssets: Record<string, { name: string; count: number; value: number; rating: number }> = {}
  for (const a of available) {
    const vid = a.vendorId ?? 'unknown'
    const v   = vendorMap[vid]
    if (!vendorAssets[vid]) vendorAssets[vid] = { name: v?.name ?? vid, count: 0, value: 0, rating: v?.rating ?? 0 }
    vendorAssets[vid].count++
    vendorAssets[vid].value += Number(a.salePrice ?? 0)
  }

  return {
    sold30, dailyVelocity,
    flashCount: flash.length, hotCount: hot.length,
    pricingSuggestions,
    vendorAssets: Object.values(vendorAssets).sort((a, b) => b.rating - a.rating),
  }
}

// ── Eficiência de time ────────────────────────────────────────────────────────

async function getTeamEfficiency() {
  const now   = new Date()
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const mEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const [rev, team] = await Promise.all([
    prisma.assetSalesOrder.aggregate({
      where: { status: { in: ['DELIVERED', 'DELIVERING'] }, deliveredAt: { gte: mStart, lt: mEnd } },
      _sum:  { negotiatedPrice: true, grossMargin: true },
    }),
    prisma.user.count({ where: { role: { not: 'ADMIN' } } }),
  ])

  const revenue     = Number(rev._sum.negotiatedPrice ?? 0)
  const grossMargin = Number(rev._sum.grossMargin ?? 0)
  const rPM         = team > 0 ? revenue / team : 0
  const mPM         = team > 0 ? grossMargin / team : 0

  // Projeção: quantas pessoas precisaria contratar para atingir a meta SEM automação
  const teamNeededWithoutAuto = revenue > 0 ? Math.ceil(REVENUE_GOAL / rPM) : 0
  const teamNeededWithAuto    = Math.ceil(teamNeededWithoutAuto * 0.3) // 70% de ganho via automação

  return { revenue, grossMargin, team, rPM, mPM, teamNeededWithoutAuto, teamNeededWithAuto }
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function GET(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Acesso restrito ao CEO' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const customBase = parseFloat(searchParams.get('baseRevenue') ?? '0')

  const [velocity, teamEff] = await Promise.all([getAssetVelocity(), getTeamEfficiency()])

  const baseRevenue = customBase || teamEff.revenue || 50_000

  // Taxas de crescimento mensais por cenário
  const RATES = { conservative: 0.08, base: 0.18, aggressive: 0.30 }
  const MONTHS = 24

  const projection = {
    conservative: projectRevenue(baseRevenue, RATES.conservative, MONTHS),
    base:         projectRevenue(baseRevenue, RATES.base,         MONTHS),
    aggressive:   projectRevenue(baseRevenue, RATES.aggressive,   MONTHS),
  }

  // Marcos: quando cada cenário atinge R$1M/mês e R$83M/mês (Bilhão anual)
  const milestones = {
    million: {
      conservative: monthsToTarget(baseRevenue, RATES.conservative, REVENUE_GOAL),
      base:         monthsToTarget(baseRevenue, RATES.base,         REVENUE_GOAL),
      aggressive:   monthsToTarget(baseRevenue, RATES.aggressive,   REVENUE_GOAL),
    },
    billion: {
      conservative: monthsToTarget(baseRevenue, RATES.conservative, BILLION_YEAR / 12),
      base:         monthsToTarget(baseRevenue, RATES.base,         BILLION_YEAR / 12),
      aggressive:   monthsToTarget(baseRevenue, RATES.aggressive,   BILLION_YEAR / 12),
    },
  }

  // Reinvestimento: impacto de reinvestir % do lucro
  const reinvestmentScenarios = [10, 20, 30, 50].map((pct) => {
    const monthlyAdd   = (teamEff.grossMargin * pct) / 100
    const projected12  = baseRevenue * Math.pow(1 + (pct / 100) * 0.4, 12)
    return { pct, monthlyAdd, projected12, impact: `+${Math.round(projected12 / baseRevenue - 1) * 100}%` }
  })

  // Labels para gráfico (meses)
  const labels = Array.from({ length: MONTHS + 1 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() + i)
    return d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' })
  })

  return NextResponse.json({
    baseRevenue,
    projection,
    labels,
    milestones,
    teamEfficiency: teamEff,
    velocity,
    reinvestmentScenarios,
    rates: RATES,
    targets: { million: REVENUE_GOAL, billion: BILLION_YEAR / 12 },
  })
}
