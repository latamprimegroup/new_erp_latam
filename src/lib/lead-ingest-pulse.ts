import { prisma } from '@/lib/prisma'
import { sendTelegramSalesMessage } from '@/lib/telegram-sales'

function utcMinuteBucket(d = new Date()): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), 0, 0),
  )
}

export async function recordLeadIngestPulse(): Promise<void> {
  const minuteUtc = utcMinuteBucket()
  await prisma.leadIngestPulse.upsert({
    where: { minuteUtc },
    create: { minuteUtc, ingestCount: 1 },
    update: { ingestCount: { increment: 1 } },
  })
}

/** Últimos N minutos, índice 0 = minuto atual */
async function loadMinuteCounts(lookbackMinutes: number): Promise<number[]> {
  const now = new Date()
  const start = new Date(now.getTime() - lookbackMinutes * 60000)
  const rows = await prisma.leadIngestPulse.findMany({
    where: { minuteUtc: { gte: start } },
    select: { minuteUtc: true, ingestCount: true },
    orderBy: { minuteUtc: 'asc' },
  })
  const map = new Map<number, number>()
  for (const r of rows) map.set(r.minuteUtc.getTime(), r.ingestCount)
  const out: number[] = []
  for (let i = lookbackMinutes - 1; i >= 0; i--) {
    const t = utcMinuteBucket(new Date(now.getTime() - i * 60000)).getTime()
    out.push(map.get(t) ?? 0)
  }
  return out
}

function sum(arr: number[], from: number, to: number): number {
  let s = 0
  for (let i = from; i <= to; i++) s += arr[i] ?? 0
  return s
}

const SILENCE_MIN = parseInt(process.env.TRAFFIC_ALERT_SILENCE_MINUTES || '10', 10) || 10
const DROP_RATIO = parseFloat(process.env.TRAFFIC_ALERT_VOLUME_DROP_RATIO || '0.25') || 0.25
const MIN_BASELINE_PER_MIN = parseFloat(process.env.TRAFFIC_ALERT_MIN_BASELINE_PER_MIN || '2') || 2
const TELEGRAM_COOLDOWN_MS = parseInt(process.env.TRAFFIC_ALERT_TELEGRAM_COOLDOWN_MS || '2700000', 10) || 2700000
/** Janela recente (min) para comparar taxa vs média anterior — padrão 15 (Prompt Mestre) */
const RECENT_WINDOW_MIN = parseInt(process.env.TRAFFIC_ALERT_RECENT_WINDOW_MINUTES || '15', 10) || 15

export type TrafficHealthPayload = {
  generatedAt: string
  lookbackMinutes: number
  /** minutos usados na janela “recente” para detetar queda */
  recentWindowMinutes: number
  /** soma ingestões na janela recente */
  sumLastRecentMin: number
  /** @deprecated usar sumLastRecentMin — mantido = sumLastRecentMin */
  sumLast5Min: number
  /** média por minuto no período anterior à janela recente (até 30 min) */
  avgPerMinBaseline: number
  /** último webhook de captura (aprox.: último pulse >0) */
  lastIngestAt: string | null
  alerts: {
    webhookSilence: boolean
    volumeDrop: boolean
    messages: string[]
  }
}

export async function evaluateTrafficHealthAndAlerts(): Promise<TrafficHealthPayload> {
  const lookback = 45
  const counts = await loadMinuteCounts(lookback)
  const n = counts.length
  const recentMin = Math.min(Math.max(1, RECENT_WINDOW_MIN), n)
  const sumRecent = sum(counts, Math.max(0, n - recentMin), n - 1)
  const rateRecent = recentMin > 0 ? sumRecent / recentMin : 0
  const baselineEnd = n - recentMin - 1
  const baselineLen = Math.min(30, Math.max(1, baselineEnd + 1))
  const baselineStart = Math.max(0, baselineEnd - baselineLen + 1)
  const sumBaseline = baselineEnd >= 0 ? sum(counts, baselineStart, baselineEnd) : 0
  const avgBaseline = baselineLen > 0 && baselineEnd >= 0 ? sumBaseline / baselineLen : 0

  let lastIngestAt: Date | null = null
  const rows = await prisma.leadIngestPulse.findMany({
    where: { ingestCount: { gt: 0 } },
    orderBy: { minuteUtc: 'desc' },
    take: 1,
    select: { minuteUtc: true },
  })
  if (rows[0]) lastIngestAt = rows[0].minuteUtc

  const now = Date.now()
  const silence =
    lastIngestAt != null && now - lastIngestAt.getTime() > SILENCE_MIN * 60000 && sum(counts, 0, n - 1) > 0

  const volumeDrop =
    avgBaseline >= MIN_BASELINE_PER_MIN &&
    rateRecent < avgBaseline * DROP_RATIO &&
    sumRecent < avgBaseline * recentMin

  const messages: string[] = []
  if (silence) messages.push(`Sem webhooks de lead há mais de ${SILENCE_MIN} min (verificar site / pixel / conta ads).`)
  if (volumeDrop)
    messages.push(
      `Queda brusca de volume: ~${rateRecent.toFixed(1)}/min (últimos ${recentMin} min) vs média ~${avgBaseline.toFixed(1)}/min no período anterior.`,
    )

  const alerts = { webhookSilence: silence, volumeDrop, messages }

  if (messages.length) {
    const state = await prisma.trafficAlertState.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    })
    const sendSilence =
      silence &&
      (!state.lastSilenceAlertAt || now - state.lastSilenceAlertAt.getTime() > TELEGRAM_COOLDOWN_MS)
    const sendVolume =
      volumeDrop &&
      (!state.lastVolumeDropAlertAt || now - state.lastVolumeDropAlertAt.getTime() > TELEGRAM_COOLDOWN_MS)

    if (sendSilence || sendVolume) {
      const text = ['⚠️ <b>Saúde do tráfego — ERP</b>', ...messages.map((m) => `• ${m}`)].join('\n')
      const tg = await sendTelegramSalesMessage(text)
      if (tg.ok) {
        await prisma.trafficAlertState.update({
          where: { id: 'default' },
          data: {
            ...(sendSilence ? { lastSilenceAlertAt: new Date() } : {}),
            ...(sendVolume ? { lastVolumeDropAlertAt: new Date() } : {}),
          },
        })
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    lookbackMinutes: lookback,
    recentWindowMinutes: recentMin,
    sumLastRecentMin: sumRecent,
    sumLast5Min: sumRecent,
    avgPerMinBaseline: Math.round(avgBaseline * 100) / 100,
    lastIngestAt: lastIngestAt?.toISOString() ?? null,
    alerts,
  }
}
