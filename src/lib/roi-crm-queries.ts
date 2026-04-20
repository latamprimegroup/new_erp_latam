import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const PAID_LIKE = ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] as const

function orderWhereInPeriod(from: Date, to: Date): Prisma.OrderWhereInput {
  return {
    status: { in: [...PAID_LIKE] },
    OR: [
      { paidAt: { gte: from, lte: to } },
      {
        AND: [{ paidAt: null }, { createdAt: { gte: from, lte: to } }],
      },
    ],
  }
}

/** Dia civil em BRT (negócio local) — alinha barras do gráfico com fechamento diário. */
function formatBrtYmd(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Meio-dia UTC no dia civil local de `d` — alinha com `POST /api/roi-crm/daily-spend` (upsert por data). */
function utcNoonForLocalCalendarDay(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0))
}

/** Dias civis BRT entre os instantes `from` e `to` (inclusive), como YYYY-MM-DD. */
function eachBrtDayInRange(from: Date, to: Date): string[] {
  const start = formatBrtYmd(from)
  const end = formatBrtYmd(to)
  const keys: string[] = []
  let cur = start
  let guard = 0
  while (cur <= end && guard++ < 400) {
    keys.push(cur)
    const [y, m, d] = cur.split('-').map((x) => parseInt(x, 10))
    const n = new Date(Date.UTC(y, m - 1, d, 15, 0, 0, 0))
    n.setUTCDate(n.getUTCDate() + 1)
    const next = formatBrtYmd(n)
    if (next <= cur) break
    cur = next
  }
  return keys
}

export type RoiDailyPoint = { data: string; investimento: number; faturamento: number }

/**
 * Dia civil em America/Sao_Paulo (BRT, UTC−3 fixo) como intervalo UTC inclusivo.
 * Usado no fechamento de caixa diário para alinhar vendas ao calendário do negócio.
 */
export function brtDayBoundsUtc(dateYmd: string): { from: Date; to: Date } {
  const parts = dateYmd.split('-').map((x) => parseInt(x, 10))
  const y = parts[0]!
  const mo = parts[1]!
  const d = parts[2]!
  if (!y || !mo || !d) throw new Error('Data inválida (use YYYY-MM-DD)')
  const from = new Date(Date.UTC(y, mo - 1, d, 3, 0, 0, 0))
  const to = new Date(from.getTime() + 86_400_000 - 1)
  return { from, to }
}

/**
 * Fechamento de um dia civil BRT: faturamento (pedidos pagos no intervalo) + soma de ads_spend_daily na data YYYY-MM-DD.
 */
export async function getRoiDailyClose(dateYmd: string) {
  const { from, to } = brtDayBoundsUtc(dateYmd)
  const orderWhere = orderWhereInPeriod(from, to)

  const dayStart = new Date(`${dateYmd}T00:00:00.000Z`)
  const dayEnd = new Date(`${dateYmd}T23:59:59.999Z`)

  const [orders, spendRows] = await Promise.all([
    prisma.order.findMany({
      where: orderWhere,
      select: { value: true },
    }),
    prisma.adsSpendDaily.findMany({
      where: {
        date: { gte: dayStart, lte: dayEnd },
      },
    }),
  ])

  const revenue = orders.reduce((s, o) => s + Number(o.value), 0)
  const spend = spendRows.reduce((s, r) => s + Number(r.amountBrl), 0)
  return {
    revenue,
    spend,
    net: revenue - spend,
    ordersCount: orders.length,
    timezoneNote: 'Pedidos: dia civil BRT (UTC−3). Investimento: registros em ads_spend_daily com esta data.',
  }
}

export async function getRoiDashboardSeries(from: Date, to: Date) {
  const orderWhere = orderWhereInPeriod(from, to)

  const brtKeys = eachBrtDayInRange(from, to)
  const spendDateFilter =
    brtKeys.length > 0
      ? {
          date: {
            gte: new Date(`${brtKeys[0]}T00:00:00.000Z`),
            lte: new Date(`${brtKeys[brtKeys.length - 1]}T23:59:59.999Z`),
          },
        }
      : {
          date: {
            gte: utcNoonForLocalCalendarDay(from),
            lte: utcNoonForLocalCalendarDay(to),
          },
        }

  const [orders, spendRows, ltvSum] = await Promise.all([
    prisma.order.findMany({
      where: orderWhere,
      select: { value: true, clientId: true, createdAt: true, paidAt: true },
    }),
    prisma.adsSpendDaily.findMany({
      where: spendDateFilter,
    }),
    prisma.clientProfile.aggregate({
      _sum: { totalSpent: true },
      where: { totalSpent: { not: null } },
    }),
  ])

  const revenue = orders.reduce((s, o) => s + Number(o.value), 0)
  const spend = spendRows.reduce((s, r) => s + Number(r.amountBrl), 0)
  const ordersCount = orders.length
  const distinctClients = new Set(orders.map((o) => o.clientId)).size

  const roiPercent = spend > 0 ? ((revenue - spend) / spend) * 100 : revenue > 0 ? null : 0
  const cpaReal = ordersCount > 0 && spend > 0 ? spend / ordersCount : null

  const dayKeySet = new Set<string>(eachBrtDayInRange(from, to))
  for (const o of orders) {
    dayKeySet.add(formatBrtYmd(new Date(o.paidAt ?? o.createdAt)))
  }
  for (const r of spendRows) {
    dayKeySet.add(formatBrtYmd(new Date(r.date)))
  }
  const dayKeys = Array.from(dayKeySet).sort()

  const fatByDay = new Map<string, number>()
  const spendByDay = new Map<string, number>()

  for (const k of dayKeys) {
    fatByDay.set(k, 0)
    spendByDay.set(k, 0)
  }

  for (const o of orders) {
    const d = o.paidAt ?? o.createdAt
    const k = formatBrtYmd(new Date(d))
    fatByDay.set(k, (fatByDay.get(k) ?? 0) + Number(o.value))
  }

  for (const r of spendRows) {
    const k = formatBrtYmd(new Date(r.date))
    spendByDay.set(k, (spendByDay.get(k) ?? 0) + Number(r.amountBrl))
  }

  const daily: RoiDailyPoint[] = dayKeys.map((data) => ({
    data,
    investimento: spendByDay.get(data) ?? 0,
    faturamento: fatByDay.get(data) ?? 0,
  }))

  const ltvTotal = Number(ltvSum._sum.totalSpent ?? 0)

  return {
    revenue,
    spend,
    roiPercent,
    cpaReal,
    ordersCount,
    distinctClients,
    ltvTotal,
    daily,
  }
}

export type CampaignAttributionLead = {
  utmCampaign: string | null
  campaignName: string | null
  utmSource: string | null
}

/**
 * Rótulo de campanha para ROI: prioriza perfil (TinTim já casado), senão último evento de lead.
 */
export function resolveCampaignAttributionLabel(
  roiAttributionCampaign: string | null,
  latestLead: CampaignAttributionLead | null
): string {
  const trimmed = roiAttributionCampaign?.trim()
  if (trimmed) return trimmed
  if (!latestLead) return 'Não atribuído'
  const u = latestLead.utmCampaign?.trim()
  if (u) return u
  const c = latestLead.campaignName?.trim()
  if (c) return c
  const s = latestLead.utmSource?.trim()
  if (s) return s
  return 'Não atribuído'
}

export type CampaignAttributionRow = {
  campanha: string
  faturamento: number
  pedidos: number
  pctFaturamento: number
}

/**
 * Faturamento no período agregado por campanha (Google / UTM) após cruzamento TinTim ↔ ERP.
 */
export async function getCampaignAttributionBreakdown(
  from: Date,
  to: Date
): Promise<{ rows: CampaignAttributionRow[]; totalRevenue: number }> {
  const orderWhere = orderWhereInPeriod(from, to)
  const orders = await prisma.order.findMany({
    where: orderWhere,
    select: {
      value: true,
      client: {
        select: {
          roiAttributionCampaign: true,
          tintimLeadEvents: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { utmCampaign: true, campaignName: true, utmSource: true },
          },
        },
      },
    },
  })

  const map = new Map<string, { revenue: number; pedidos: number }>()
  for (const o of orders) {
    const lead = o.client.tintimLeadEvents[0] ?? null
    const label = resolveCampaignAttributionLabel(o.client.roiAttributionCampaign, lead)
    const cur = map.get(label) ?? { revenue: 0, pedidos: 0 }
    cur.revenue += Number(o.value)
    cur.pedidos += 1
    map.set(label, cur)
  }

  const totalRevenue = orders.reduce((s, o) => s + Number(o.value), 0)
  const rows: CampaignAttributionRow[] = [...map.entries()]
    .map(([campanha, v]) => ({
      campanha,
      faturamento: v.revenue,
      pedidos: v.pedidos,
      pctFaturamento: totalRevenue > 0 ? (v.revenue / totalRevenue) * 100 : 0,
    }))
    .sort((a, b) => b.faturamento - a.faturamento)

  return { rows, totalRevenue }
}
