import { prisma } from '@/lib/prisma'
import {
  decToNumber,
  clampDeductionPct,
  getMentoradoOfferIds,
} from '@/lib/cliente/profit-board'

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
}

function endOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999))
}

function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + days)
  return x
}

/**
 * Lucro líquido e totais no estilo Profit Board (tracker S2S − gasto Creative Vault),
 * com dedução global `PROFIT_BOARD_DEFAULT_DEDUCTION_PCT`.
 */
export async function computeGamificationLifetimeTotals(clientId: string): Promise<{
  netProfit: number
  grossRevenue: number
  adSpend: number
  deductionPct: number
}> {
  const deductionPct = clampDeductionPct(process.env.PROFIT_BOARD_DEFAULT_DEDUCTION_PCT ?? '0')
  const from = new Date(Date.UTC(2020, 0, 1))
  const to = endOfDayUtc(new Date())
  const offerIds = await getMentoradoOfferIds(clientId)

  const [revenueAgg, spendAgg] = await Promise.all([
    offerIds.length === 0
      ? Promise.resolve({ _sum: { amountGross: null as null } })
      : prisma.trackerOfferSaleSignal.aggregate({
          where: {
            offerId: { in: offerIds },
            paymentState: 'APPROVED',
            countedForRevenue: true,
            createdAt: { gte: from, lte: to },
          },
          _sum: { amountGross: true },
        }),
    prisma.creativeAdMetricsEntry.aggregate({
      where: { clientId, metricDate: { gte: from, lte: to } },
      _sum: { spend: true },
    }),
  ])

  const grossRevenue = decToNumber(revenueAgg._sum.amountGross)
  const adSpend = decToNumber(spendAgg._sum.spend)
  const netRevenue = grossRevenue * (1 - deductionPct / 100)
  const netProfit = netRevenue - adSpend

  return { netProfit, grossRevenue, adSpend, deductionPct }
}

/** Marcos de patente (lucro líquido total em BRL) */
export const PATENT_THRESHOLDS_BRL = [
  { id: 'RECRUTA' as const, minBrl: 0 },
  { id: 'SOLDADO' as const, minBrl: 10_000 },
  { id: 'COMANDANTE' as const, minBrl: 50_000 },
  { id: 'GENERAL' as const, minBrl: 100_000 },
  { id: 'SOCIO_CAOS' as const, minBrl: 1_000_000 },
] as const

export type PatentId = (typeof PATENT_THRESHOLDS_BRL)[number]['id']

export function patentFromNetProfit(netBrl: number): PatentId {
  const n = Number.isFinite(netBrl) ? netBrl : 0
  let current: PatentId = 'RECRUTA'
  for (const t of PATENT_THRESHOLDS_BRL) {
    if (n >= t.minBrl) current = t.id
  }
  return current
}

export function patentRankIndex(id: PatentId): number {
  const i = PATENT_THRESHOLDS_BRL.findIndex((t) => t.id === id)
  return i >= 0 ? i : 0
}

export function patentProgressFromNet(netBrl: number) {
  const patentId = patentFromNetProfit(netBrl)
  const idx = patentRankIndex(patentId)
  const floor = PATENT_THRESHOLDS_BRL[idx].minBrl
  const next = PATENT_THRESHOLDS_BRL[idx + 1]
  if (!next) {
    return {
      patentId,
      nextPatentId: null as PatentId | null,
      progressFraction: 1,
      currentFloor: floor,
      nextCeiling: null as number | null,
    }
  }
  const span = next.minBrl - floor
  const frac = span > 0 ? Math.max(0, Math.min(1, (netBrl - floor) / span)) : 1
  return {
    patentId,
    nextPatentId: next.id,
    progressFraction: frac,
    currentFloor: floor,
    nextCeiling: next.minBrl,
  }
}

/** Variante visual do badge (header) */
export type PatentBadgeVariant = 'recruit' | 'silver' | 'command' | 'gold' | 'chaos'

export function patentBadgeVariant(id: PatentId): PatentBadgeVariant {
  switch (id) {
    case 'SOLDADO':
      return 'silver'
    case 'COMANDANTE':
      return 'command'
    case 'GENERAL':
      return 'gold'
    case 'SOCIO_CAOS':
      return 'chaos'
    default:
      return 'recruit'
  }
}

/** Recompensas físicas — Arsenal de Conquistas */
export type GamificationRewardKey = 'MOLETOM' | 'CANECA' | 'TROFEU' | 'RELOGIO'

export type GamificationRewardDef = {
  key: GamificationRewardKey
  minNetProfitBrl: number
  titleKey: string
  descKey: string
}

export const GAMIFICATION_REWARD_DEFS: GamificationRewardDef[] = [
  { key: 'CANECA', minNetProfitBrl: 5_000, titleKey: 'canecaTitle', descKey: 'canecaDesc' },
  { key: 'MOLETOM', minNetProfitBrl: 25_000, titleKey: 'moletomTitle', descKey: 'moletomDesc' },
  { key: 'TROFEU', minNetProfitBrl: 75_000, titleKey: 'trofeuTitle', descKey: 'trofeuDesc' },
  { key: 'RELOGIO', minNetProfitBrl: 250_000, titleKey: 'relogioTitle', descKey: 'relogioDesc' },
]

export function rewardUnlocked(netBrl: number, def: GamificationRewardDef): boolean {
  return netBrl >= def.minNetProfitBrl
}

/** Codinome estável para leaderboard (privacidade) */
export function operatorCodename(clientId: string): string {
  let h = 0
  for (let i = 0; i < clientId.length; i++) {
    h = (h * 31 + clientId.charCodeAt(i)) >>> 0
  }
  const n = (h % 99) + 1
  const letter = String.fromCharCode(65 + (h % 26))
  return `Operador_${String(n).padStart(2, '0')}_${letter}`
}

export type WeeklyLeaderboardRow = {
  clientId: string
  codename: string
  roiPercent: number | null
  nicheLabel: string
  weeklyNetProfitBrl: number
  weeklySpendBrl: number
}

/**
 * Top N da semana (UTC, últimos 7 dias corridos) por ROI % real:
 * (receita tracker líquida de dedução − gasto Creative Vault) / gasto.
 * Só entram operadores com gasto > 0 no período.
 */
export async function computeWeeklyLeaderboardByRoi(params: {
  weekStart?: Date
  limit?: number
  viewerClientId?: string
}): Promise<Array<WeeklyLeaderboardRow & { isYou: boolean }>> {
  const now = new Date()
  const end = endOfDayUtc(now)
  const start = startOfDayUtc(addUtcDays(now, -6))
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 50)
  const deductionPct = clampDeductionPct(process.env.PROFIT_BOARD_DEFAULT_DEDUCTION_PCT ?? '0')

  const [salesByOffer, spendAgg] = await Promise.all([
    prisma.trackerOfferSaleSignal.groupBy({
      by: ['offerId'],
      where: {
        paymentState: 'APPROVED',
        countedForRevenue: true,
        createdAt: { gte: start, lte: end },
      },
      _sum: { amountGross: true },
    }),
    prisma.creativeAdMetricsEntry.groupBy({
      by: ['clientId'],
      where: { metricDate: { gte: start, lte: end } },
      _sum: { spend: true },
    }),
  ])

  const weekOfferIds = [...new Set(salesByOffer.map((r) => r.offerId))]
  const links =
    weekOfferIds.length === 0
      ? []
      : await prisma.mentoradoShieldTrackerLink.findMany({
          where: { offerId: { in: weekOfferIds } },
          select: { clientId: true, offerId: true },
        })

  const offerOwners = new Map<string, string[]>()
  for (const l of links) {
    const arr = offerOwners.get(l.offerId) ?? []
    arr.push(l.clientId)
    offerOwners.set(l.offerId, arr)
  }

  const grossByClient = new Map<string, number>()
  for (const row of salesByOffer) {
    const owners = offerOwners.get(row.offerId) ?? []
    if (!owners.length) continue
    const gross = decToNumber(row._sum.amountGross)
    if (gross <= 0) continue
    const each = gross / owners.length
    for (const cid of owners) {
      grossByClient.set(cid, (grossByClient.get(cid) ?? 0) + each)
    }
  }

  const spendByClient = new Map<string, number>()
  for (const row of spendAgg) {
    spendByClient.set(row.clientId, decToNumber(row._sum.spend))
  }

  type Cand = { clientId: string; net: number; spend: number; roi: number }
  const cands: Cand[] = []
  const clientIds = new Set<string>([...grossByClient.keys(), ...spendByClient.keys()])
  for (const clientId of clientIds) {
    const spend = spendByClient.get(clientId) ?? 0
    if (spend <= 0) continue
    const gross = grossByClient.get(clientId) ?? 0
    const netRev = gross * (1 - deductionPct / 100)
    const net = netRev - spend
    const roi = (net / spend) * 100
    if (!Number.isFinite(roi)) continue
    cands.push({ clientId, net, spend, roi })
  }

  cands.sort((a, b) => b.roi - a.roi)
  const top = cands.slice(0, limit)
  if (top.length === 0) return []

  const profileIds = top.map((t) => t.clientId)
  const profiles = await prisma.clientProfile.findMany({
    where: { id: { in: profileIds } },
    select: { id: true, operationNiche: true, widgetNiche: true },
  })
  const nicheById = new Map<string, string>()
  for (const p of profiles) {
    const label = (p.operationNiche || p.widgetNiche || 'GERAL').trim() || 'GERAL'
    nicheById.set(p.id, label)
  }

  const viewer = params.viewerClientId

  return top.map((t) => ({
    clientId: t.clientId,
    codename: operatorCodename(t.clientId),
    roiPercent: t.roi,
    nicheLabel: nicheById.get(t.clientId) ?? 'GERAL',
    weeklyNetProfitBrl: t.net,
    weeklySpendBrl: t.spend,
    isYou: viewer != null && t.clientId === viewer,
  }))
}
