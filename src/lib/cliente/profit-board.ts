import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'
import { sendTrackerTelegramAlert } from '@/lib/tracker-telegram-alert'

export type ProfitBoardRange = { from: Date; to: Date; fromStr: string; toStr: string }

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) throw new Error('invalid_ymd')
  return new Date(Date.UTC(y, m - 1, d))
}

export function formatYmd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
}

function endOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999))
}

function addDaysUtc(d: Date, n: number): Date {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + n)
  return x
}

export function resolveProfitBoardRange(searchParams: URLSearchParams): ProfitBoardRange {
  const today = new Date()
  let toStr = searchParams.get('to')?.trim() || formatYmd(today)
  let fromStr = searchParams.get('from')?.trim() || ''
  if (!fromStr) {
    fromStr = formatYmd(addDaysUtc(parseYmd(toStr), -30))
  }
  let from = startOfDayUtc(parseYmd(fromStr))
  let to = endOfDayUtc(parseYmd(toStr))
  if (from > to) {
    const tmp = fromStr
    fromStr = toStr
    toStr = tmp
    from = startOfDayUtc(parseYmd(fromStr))
    to = endOfDayUtc(parseYmd(toStr))
  }
  return { from, to, fromStr, toStr }
}

export function decToNumber(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0
  return Number(v)
}

export function clampDeductionPct(raw: string | null): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > 99) return 99
  return Math.round(n * 100) / 100
}

export async function getMentoradoOfferIds(clientId: string): Promise<string[]> {
  const rows = await prisma.mentoradoShieldTrackerLink.findMany({
    where: { clientId },
    select: { offerId: true },
  })
  return rows.map((r) => r.offerId)
}

export async function getClientUniIds(clientId: string): Promise<string[]> {
  const rows = await prisma.clientMentoradoUniAccess.findMany({
    where: { clientId },
    select: { uniId: true },
  })
  return rows.map((r) => r.uniId)
}

const BLEEDING_NOTIF_TYPE = 'PROFIT_BOARD_BLEEDING'

export async function maybeNotifyProfitBleeding(opts: {
  userId: string
  clientId: string
  clientCode: string | null
  bleeding: boolean
  spend7d: number
  checkouts7d: number
}): Promise<{ inAppSent: boolean; telegramOk: boolean; telegramSkipped: boolean }> {
  if (!opts.bleeding) {
    return { inAppSent: false, telegramOk: false, telegramSkipped: true }
  }

  const since = new Date(Date.now() - 24 * 3600 * 1000)
  const dup = await prisma.notification.findFirst({
    where: { userId: opts.userId, type: BLEEDING_NOTIF_TYPE, createdAt: { gte: since } },
    select: { id: true },
  })
  if (dup) {
    return { inAppSent: false, telegramOk: false, telegramSkipped: true }
  }

  const title = 'Profit Board — possível sangramento'
  const message = `Gasto registado nos últimos 7 dias (${opts.spend7d.toFixed(2)} BRL) sem redirecionamento ao checkout (início de finalização). Revê a VSL / página de oferta (Módulo 03) e considera pausar o tráfego até corrigir.`
  const link = '/dashboard/cliente/profit-board'

  await notify({
    userId: opts.userId,
    type: BLEEDING_NOTIF_TYPE,
    title,
    message,
    link,
    priority: 'HIGH',
    channels: ['IN_APP'],
  })

  const tgText = [
    `<b>Profit Board — sangramento</b>`,
    `Cliente: <code>${opts.clientCode || opts.clientId}</code>`,
    `Gasto 7d (Creative Vault): ${opts.spend7d.toFixed(2)} BRL`,
    `Checkouts REDIRECT_302 (7d): ${opts.checkouts7d}`,
    `Mensagem: tráfego sem início de checkout — rever oferta/VSL.`,
  ].join('\n')

  const tg = await sendTrackerTelegramAlert(tgText)

  return { inAppSent: true, telegramOk: tg.ok, telegramSkipped: tg.skipped }
}

export async function computePeerCreativeRoiBenchmark(opts: {
  nicheKey: string
  excludeClientId: string
  from: Date
  to: Date
}): Promise<{ peerAvg: number | null; sampleSize: number }> {
  const niche = opts.nicheKey.trim() || 'GERAL'

  const peerWhere: Prisma.ClientProfileWhereInput =
    niche === 'GERAL'
      ? { id: { not: opts.excludeClientId } }
      : { operationNiche: niche, id: { not: opts.excludeClientId } }

  const peers = await prisma.clientProfile.findMany({
    where: peerWhere,
    select: { id: true },
    take: 500,
  })
  const peerIds = peers.map((p) => p.id)
  if (peerIds.length === 0) return { peerAvg: null, sampleSize: 0 }

  const grouped = await prisma.creativeAdMetricsEntry.groupBy({
    by: ['clientId'],
    where: {
      clientId: { in: peerIds },
      metricDate: { gte: opts.from, lte: opts.to },
    },
    _sum: { spend: true, sales: true },
  })

  const rois: number[] = []
  for (const row of grouped) {
    const sp = decToNumber(row._sum.spend)
    const sa = decToNumber(row._sum.sales)
    if (sp <= 0) continue
    rois.push(((sa - sp) / sp) * 100)
  }

  if (rois.length < 3) return { peerAvg: null, sampleSize: rois.length }

  const peerAvg = rois.reduce((a, b) => a + b, 0) / rois.length
  return { peerAvg, sampleSize: rois.length }
}

export async function buildDreDailyRows(opts: {
  clientId: string
  offerIds: string[]
  year: number
  month: number
  deductionPct: number
}): Promise<
  Array<{
    date: string
    grossRevenue: number
    netRevenue: number
    spend: number
    netProfit: number
  }>
> {
  const lastDay = new Date(Date.UTC(opts.year, opts.month, 0)).getUTCDate()
  const factor = 1 - opts.deductionPct / 100
  const monthStart = new Date(Date.UTC(opts.year, opts.month - 1, 1, 0, 0, 0, 0))
  const monthEnd = new Date(Date.UTC(opts.year, opts.month - 1, lastDay, 23, 59, 59, 999))

  const [metricRows, signalRows] = await Promise.all([
    prisma.creativeAdMetricsEntry.findMany({
      where: { clientId: opts.clientId, metricDate: { gte: monthStart, lte: monthEnd } },
      select: { metricDate: true, spend: true },
    }),
    opts.offerIds.length === 0
      ? Promise.resolve([] as { createdAt: Date; amountGross: Prisma.Decimal }[])
      : prisma.trackerOfferSaleSignal.findMany({
          where: {
            offerId: { in: opts.offerIds },
            paymentState: 'APPROVED',
            countedForRevenue: true,
            createdAt: { gte: monthStart, lte: monthEnd },
          },
          select: { createdAt: true, amountGross: true },
        }),
  ])

  const spendByDay = new Map<string, number>()
  for (const row of metricRows) {
    const key = formatYmd(row.metricDate)
    spendByDay.set(key, (spendByDay.get(key) || 0) + decToNumber(row.spend))
  }

  const grossByDay = new Map<string, number>()
  for (const s of signalRows) {
    const key = formatYmd(s.createdAt)
    grossByDay.set(key, (grossByDay.get(key) || 0) + decToNumber(s.amountGross))
  }

  const rows: Array<{ date: string; grossRevenue: number; netRevenue: number; spend: number; netProfit: number }> = []
  for (let day = 1; day <= lastDay; day++) {
    const d0 = new Date(Date.UTC(opts.year, opts.month - 1, day, 0, 0, 0, 0))
    const key = formatYmd(d0)
    const gross = grossByDay.get(key) || 0
    const spend = spendByDay.get(key) || 0
    const netRev = gross * factor
    const netProfit = netRev - spend
    rows.push({ date: key, grossRevenue: gross, netRevenue: netRev, spend, netProfit })
  }

  return rows
}
