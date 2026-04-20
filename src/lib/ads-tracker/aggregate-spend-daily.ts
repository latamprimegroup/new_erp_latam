import { prisma } from '@/lib/prisma'

const SOURCE = 'GOOGLE_ACCOUNT_LOGS'

/**
 * Agrega `account_spend_logs` por dia civil (UTC) em `ads_spend_daily` com source GOOGLE_ACCOUNT_LOGS.
 */
export async function aggregateAccountLogsToAdsSpendDaily(opts: {
  sinceDays: number
}): Promise<{ upserted: number }> {
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - Math.max(1, opts.sinceDays))

  const logs = await prisma.accountSpendLog.findMany({
    where: { periodStart: { gte: since } },
    select: { periodStart: true, costMicros: true },
  })

  const byDay = new Map<string, number>()
  for (const row of logs) {
    const key = row.periodStart.toISOString().slice(0, 10)
    const brl = Number(row.costMicros) / 1_000_000
    byDay.set(key, (byDay.get(key) ?? 0) + brl)
  }

  let upserted = 0
  for (const [dateStr, amountBrl] of byDay) {
    const day = new Date(`${dateStr}T12:00:00.000Z`)
    await prisma.adsSpendDaily.upsert({
      where: {
        date_source: {
          date: day,
          source: SOURCE,
        },
      },
      create: {
        date: day,
        amountBrl,
        source: SOURCE,
        note: 'account_spend_logs (tracker sync)',
      },
      update: {
        amountBrl,
        note: 'account_spend_logs (tracker sync)',
      },
    })
    upserted += 1
  }

  return { upserted }
}
