import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { maskCnpj, maskEmail } from '@/lib/gatekeeper/masking'
import { isValidGclid } from '@/lib/ads-tracker/s2s-payload'

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
}

function utcDayEnd(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999))
}

function parseRange(preset: string): { start: Date; end: Date; label: string } {
  const now = new Date()
  if (preset === 'today') {
    return { start: utcDayStart(now), end: utcDayEnd(now), label: 'Hoje' }
  }
  if (preset === 'yesterday') {
    const y = new Date(now)
    y.setUTCDate(y.getUTCDate() - 1)
    return { start: utcDayStart(y), end: utcDayEnd(y), label: 'Ontem' }
  }
  const n = preset === '30d' ? 30 : 7
  const start = utcDayStart(now)
  start.setUTCDate(start.getUTCDate() - (n - 1))
  return { start, end: utcDayEnd(now), label: `${n}d` }
}

function brHourKey(d: Date): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00'
  return `${h}h`
}

function roiFrom(spend: number, revenue: number): number {
  if (spend <= 0) return 0
  return (revenue - spend) / spend
}

/**
 * GET — Overview financeiro do Tracker (gastos Google agregados + receita S2S com GCLID).
 * Query: ?range=today|yesterday|7d|30d
 */
export async function GET(req: Request) {
  const auth = await requireRoles(['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'FINANCE'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const preset = searchParams.get('range') || '7d'
  const allowed = new Set(['today', 'yesterday', '7d', '30d'])
  const range = parseRange(allowed.has(preset) ? preset : '7d')

  const spendLogs = await prisma.accountSpendLog.findMany({
    where: {
      periodStart: { gte: range.start, lte: range.end },
    },
    select: { costMicros: true, clicks: true, conversions: true },
  })

  let spendMicros = BigInt(0)
  let clicks = 0
  let googleConversions = 0
  for (const l of spendLogs) {
    spendMicros += l.costMicros
    clicks += l.clicks
    googleConversions += l.conversions ?? 0
  }
  const spendBrl = Number(spendMicros) / 1_000_000

  const events = await prisma.affiliateWebhookEvent.findMany({
    where: {
      createdAt: { gte: range.start, lte: range.end },
    },
    select: {
      roiValueBrl: true,
      gclid: true,
      paymentStatus: true,
      deviceCategory: true,
      uniId: true,
      createdAt: true,
    },
  })

  const isConfirmed = (p: string) => p === 'CONFIRMED'
  const isPending = (p: string) => p === 'PENDING'

  let revenueGclid = 0
  let revenuePending = 0
  let revenueAllConfirmed = 0
  let gclidSaleCount = 0

  const hourlyMap = new Map<string, { count: number; brl: number }>()
  const deviceMap = new Map<string, number>()
  const uniRevenue = new Map<string, number>()

  for (const e of events) {
    const brl = Number(e.roiValueBrl ?? 0)
    const pay = (e.paymentStatus || 'CONFIRMED').toUpperCase()
    const gclidOk = e.gclid && isValidGclid(e.gclid)

    if (isPending(pay)) {
      revenuePending += brl
    }

    if (isConfirmed(pay)) {
      revenueAllConfirmed += brl
      const hour = brHourKey(e.createdAt)
      const cur = hourlyMap.get(hour) ?? { count: 0, brl: 0 }
      cur.count += 1
      cur.brl += brl
      hourlyMap.set(hour, cur)

      const dev = (e.deviceCategory || 'UNKNOWN').toUpperCase()
      deviceMap.set(dev, (deviceMap.get(dev) ?? 0) + 1)
    }

    if (isConfirmed(pay) && gclidOk) {
      revenueGclid += brl
      gclidSaleCount += 1
      if (e.uniId) {
        uniRevenue.set(e.uniId, (uniRevenue.get(e.uniId) ?? 0) + brl)
      }
    }
  }

  const profitGclid = revenueGclid - spendBrl
  const roi = roiFrom(spendBrl, revenueGclid)
  const cpaGclid = gclidSaleCount > 0 && spendBrl > 0 ? spendBrl / gclidSaleCount : 0
  const convRateGoogle = clicks > 0 ? googleConversions / clicks : 0
  const convRateAttributed = clicks > 0 ? gclidSaleCount / clicks : 0

  const range7 = parseRange('7d')
  const logs7 = await prisma.accountSpendLog.findMany({
    where: { periodStart: { gte: range7.start, lte: range7.end } },
    select: { costMicros: true },
  })
  let micros7 = BigInt(0)
  for (const l of logs7) micros7 += l.costMicros
  const spend7 = Number(micros7) / 1_000_000

  const ev7 = await prisma.affiliateWebhookEvent.findMany({
    where: { createdAt: { gte: range7.start, lte: range7.end } },
    select: { roiValueBrl: true, gclid: true, paymentStatus: true },
  })
  let rev7 = 0
  for (const e of ev7) {
    if ((e.paymentStatus || 'CONFIRMED').toUpperCase() !== 'CONFIRMED') continue
    if (e.gclid && isValidGclid(e.gclid)) rev7 += Number(e.roiValueBrl ?? 0)
  }
  const roi7d = roiFrom(spend7, rev7)
  const scaleAlert = spendBrl > 0 && revenueGclid > 0 && roi7d > 0 && roi > roi7d * 1.3

  const shieldAgg = await prisma.adsTrackerShieldDaily.aggregate({
    where: {
      day: { gte: range.start, lte: range.end },
    },
    _sum: {
      blockedClicks: true,
      estimatedSavedBrl: true,
    },
  })

  const avgCpc = clicks > 0 && spendBrl > 0 ? spendBrl / clicks : 0

  const totalUniRev = [...uniRevenue.values()].reduce((a, b) => a + b, 0)
  const uniIds = [...uniRevenue.keys()]
  const unis =
    uniIds.length > 0
      ? await prisma.vaultIndustrialUnit.findMany({
          where: { id: { in: uniIds } },
          include: {
            inventoryGmail: { select: { email: true } },
            inventoryCnpj: { select: { cnpj: true } },
          },
        })
      : []

  const uniLabel = (id: string) => {
    const u = unis.find((x) => x.id === id)
    if (!u) return id.slice(0, 8) + '…'
    return `${maskEmail(u.inventoryGmail.email)} · ${maskCnpj(u.inventoryCnpj.cnpj)}`
  }

  const topUnis = [...uniRevenue.entries()]
    .map(([uniId, rev]) => {
      const allocatedSpend =
        totalUniRev > 0 && spendBrl > 0 ? spendBrl * (rev / totalUniRev) : spendBrl > 0 ? spendBrl / uniIds.length : 0
      const roi =
        allocatedSpend > 0
          ? (rev - allocatedSpend) / allocatedSpend
          : rev > 0
            ? null
            : 0
      return {
        uniId,
        label: uniLabel(uniId),
        revenueGclidBrl: rev,
        allocatedSpendBrl: allocatedSpend,
        roi,
        note:
          totalUniRev > 0
            ? 'Gasto alocado proporcionalmente à receita GCLID no período (aproximação).'
            : 'Sem base para alocar gasto.',
      }
    })
    .sort((a, b) => {
      const ra = a.roi ?? Number.POSITIVE_INFINITY
      const rb = b.roi ?? Number.POSITIVE_INFINITY
      return rb - ra
    })
    .slice(0, 5)

  const hourlySales = [...hourlyMap.entries()]
    .map(([hour, v]) => ({ hour, sales: v.count, revenueBrl: v.brl }))
    .sort((a, b) => a.hour.localeCompare(b.hour))

  const deviceBreakdown = ['MOBILE', 'DESKTOP', 'TABLET', 'UNKNOWN'].map((k) => ({
    name: k,
    value: deviceMap.get(k) ?? 0,
  }))

  return NextResponse.json({
    range: {
      preset: allowed.has(preset) ? preset : '7d',
      label: range.label,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    },
    kpis: {
      spendBrlGoogle: spendBrl,
      revenueConfirmedGclidBrl: revenueGclid,
      revenuePendingBrl: revenuePending,
      revenueAllConfirmedBrl: revenueAllConfirmed,
      profitNetGclidBrl: profitGclid,
      roiGclid: roi,
      cpaGclidBrl: cpaGclid,
      conversionRateGoogle: convRateGoogle,
      conversionRateAttributedGclid: convRateAttributed,
      googleClicks: clicks,
      googleConversions,
      gclidAttributedSales: gclidSaleCount,
    },
    charts: {
      hourlySales: hourlySales,
      deviceBreakdown,
    },
    topUnisByRoi: topUnis,
    alerts: {
      scaleProfitHighlight: scaleAlert,
      roiBaseline7d: roi7d,
      desktopShare:
        deviceBreakdown.reduce((s, x) => s + x.value, 0) > 0
          ? (deviceMap.get('DESKTOP') ?? 0) /
            deviceBreakdown.reduce((s, x) => s + x.value, 0)
          : 0,
    },
    shield: {
      blockedClicks: shieldAgg._sum.blockedClicks ?? 0,
      estimatedSavedBrl: Number(shieldAgg._sum.estimatedSavedBrl ?? 0),
      avgCpcBrl: avgCpc,
      note:
        'Valores do Shield vêm de POST /api/admin/ads-tracker/shield-stats (ou automação futura). Economia estimada = cliques bloqueados × CPC médio do período, se não enviar saved direto.',
    },
    attributionNote:
      'Lucro e ROI principais usam apenas vendas S2S confirmadas com GCLID válido no postback, cruzadas com gasto agregado das contas Google (logs diários).',
  })
}
