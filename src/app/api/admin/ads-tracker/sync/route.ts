import { NextResponse } from 'next/server'
import { AccountPlatform } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { fetchCustomerSpendByDay, isGoogleAdsConfigured } from '@/lib/google-ads'
import { aggregateAccountLogsToAdsSpendDaily } from '@/lib/ads-tracker/aggregate-spend-daily'

/**
 * POST — Puxa gastos por dia (Google Ads API) para contas em estoque com customer id e atualiza
 * `account_spend_logs` + agregado `ads_spend_daily` (source GOOGLE_ACCOUNT_LOGS).
 */
export async function POST(req: Request) {
  const auth = await requireRoles(['ADMIN', 'FINANCE', 'MANAGER', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  if (!isGoogleAdsConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Google Ads API não configurada (env GOOGLE_ADS_*).' },
      { status: 503 }
    )
  }

  let days = 14
  try {
    const body = await req.json()
    if (typeof body?.days === 'number' && Number.isFinite(body.days)) {
      days = Math.min(90, Math.max(1, Math.floor(body.days)))
    }
  } catch {
    /* default */
  }

  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - days)
  const startStr = start.toISOString().slice(0, 10)
  const endStr = end.toISOString().slice(0, 10)

  const accounts = await prisma.stockAccount.findMany({
    where: {
      deletedAt: null,
      archivedAt: null,
      googleAdsCustomerId: { not: null },
      platform: AccountPlatform.GOOGLE_ADS,
    },
    select: { id: true, googleAdsCustomerId: true },
    take: 100,
  })

  let accountsSynced = 0
  let accountErrors = 0
  let dayRowsWritten = 0

  for (const a of accounts) {
    const cid = (a.googleAdsCustomerId || '').replace(/\D/g, '')
    if (!cid) continue
    const byDay = await fetchCustomerSpendByDay(cid, startStr, endStr)
    if (byDay === null) {
      accountErrors += 1
      continue
    }
    for (const d of byDay) {
      const periodStart = new Date(`${d.date}T12:00:00.000Z`)
      const periodEnd = periodStart
      await prisma.accountSpendLog.upsert({
        where: {
          accountId_periodStart: { accountId: a.id, periodStart },
        },
        create: {
          accountId: a.id,
          periodStart,
          periodEnd,
          costMicros: d.costMicros,
          impressions: 0,
          clicks: d.clicks,
          conversions: d.conversions,
          currencyCode: 'BRL',
        },
        update: {
          periodEnd,
          costMicros: d.costMicros,
          clicks: d.clicks,
          conversions: d.conversions,
          syncedAt: new Date(),
        },
      })
      dayRowsWritten += 1
    }
    await prisma.stockAccount.update({
      where: { id: a.id },
      data: { lastSpendSyncAt: new Date() },
    })
    accountsSynced += 1
  }

  const agg = await aggregateAccountLogsToAdsSpendDaily({ sinceDays: days + 2 })

  return NextResponse.json({
    ok: true,
    range: { start: startStr, end: endStr },
    accountsSynced,
    accountErrors,
    dayRowsWritten,
    adsSpendDailyUpserted: agg.upserted,
  })
}
