/**
 * Integração Google Ads API para puxar gastos por conta
 * Variáveis de ambiente:
 * - GOOGLE_ADS_DEVELOPER_TOKEN
 * - GOOGLE_ADS_CLIENT_ID
 * - GOOGLE_ADS_CLIENT_SECRET
 * - GOOGLE_ADS_REFRESH_TOKEN
 * - GOOGLE_ADS_LOGIN_CUSTOMER_ID (MCC, ex: 1234567890)
 *
 * Execute: npm install google-ads-api
 */

import { prisma } from './prisma'

export type SpendResult = {
  cost: number
  costMicros: bigint
  impressions: number
  clicks: number
  conversions: number
  currencyCode: string
}

export type SpendDayRow = {
  date: string
  costMicros: bigint
  clicks: number
  conversions: number
}

export async function fetchAccountSpend(
  customerId: string,
  startDate: string,
  endDate: string
): Promise<SpendResult | null> {
  const token = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID

  if (!token || !clientId || !clientSecret || !refreshToken || !loginCustomerId) {
    return null
  }

  try {
    const { GoogleAdsApi } = await import('google-ads-api')
    const client = new GoogleAdsApi({
      client_id: clientId,
      client_secret: clientSecret,
      developer_token: token,
    })

    const customer = client.Customer({
      customer_id: customerId.replace(/-/g, ''),
      login_customer_id: loginCustomerId.replace(/-/g, ''),
      refresh_token: refreshToken,
    })

    const rows = await customer.query(`
      SELECT
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        customer.currency_code
      FROM customer
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    `)

    if (!rows?.length) return null

    let costMicros = BigInt(0)
    let impressions = 0
    let clicks = 0
    let conversions = 0
    let currencyCode = 'BRL'
    for (const row of rows) {
      costMicros += BigInt(row.metrics?.cost_micros ?? 0)
      impressions += Number(row.metrics?.impressions ?? 0)
      clicks += Number(row.metrics?.clicks ?? 0)
      conversions += Number(row.metrics?.conversions ?? 0)
      if (row.customer?.currency_code) currencyCode = String(row.customer.currency_code)
    }
    return {
      cost: Number(costMicros) / 1_000_000,
      costMicros,
      impressions,
      clicks,
      conversions,
      currencyCode,
    }
  } catch (err) {
    console.error('Google Ads API error:', err)
    return null
  }
}

export async function syncAccountSpend(
  accountId: string,
  customerId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<boolean> {
  const startStr = periodStart.toISOString().slice(0, 10)
  const endStr = periodEnd.toISOString().slice(0, 10)
  const result = await fetchAccountSpend(customerId, startStr, endStr)
  if (!result) return false

  await prisma.accountSpendLog.upsert({
    where: {
      accountId_periodStart: { accountId, periodStart },
    },
    create: {
      accountId,
      periodStart,
      periodEnd,
      costMicros: result.costMicros,
      impressions: result.impressions,
      clicks: result.clicks,
      conversions: result.conversions,
      currencyCode: result.currencyCode,
    },
    update: {
      periodEnd,
      costMicros: result.costMicros,
      impressions: result.impressions,
      clicks: result.clicks,
      conversions: result.conversions,
      currencyCode: result.currencyCode,
      syncedAt: new Date(),
    },
  })

  await prisma.stockAccount.update({
    where: { id: accountId },
    data: { lastSpendSyncAt: new Date() },
  })

  return true
}

export function isGoogleAdsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN &&
    process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
  )
}

/**
 * Gasto por dia civil (segmentos) para uma conta Google Ads.
 */
export async function fetchCustomerSpendByDay(
  customerId: string,
  startDate: string,
  endDate: string
): Promise<SpendDayRow[] | null> {
  const token = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID

  if (!token || !clientId || !clientSecret || !refreshToken || !loginCustomerId) {
    return null
  }

  try {
    const { GoogleAdsApi } = await import('google-ads-api')
    const client = new GoogleAdsApi({
      client_id: clientId,
      client_secret: clientSecret,
      developer_token: token,
    })

    const customer = client.Customer({
      customer_id: customerId.replace(/-/g, ''),
      login_customer_id: loginCustomerId.replace(/-/g, ''),
      refresh_token: refreshToken,
    })

    const rows = await customer.query(`
      SELECT
        segments.date,
        metrics.cost_micros,
        metrics.clicks,
        metrics.conversions
      FROM campaign
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    `)

    if (!rows?.length) return []

    const byDay = new Map<string, { costMicros: bigint; clicks: number; conversions: number }>()
    for (const row of rows) {
      const seg = row.segments as { date?: string } | undefined
      const dateRaw = seg?.date
      const date = typeof dateRaw === 'string' ? dateRaw : dateRaw != null ? String(dateRaw) : ''
      if (!date) continue
      const m = row.metrics as { cost_micros?: unknown; clicks?: unknown; conversions?: unknown } | undefined
      const cur = byDay.get(date) ?? { costMicros: BigInt(0), clicks: 0, conversions: 0 }
      cur.costMicros += BigInt(Number(m?.cost_micros ?? 0))
      cur.clicks += Number(m?.clicks ?? 0)
      cur.conversions += Number(m?.conversions ?? 0)
      byDay.set(date, cur)
    }

    return Array.from(byDay.entries())
      .map(([date, v]) => ({
        date,
        costMicros: v.costMicros,
        clicks: v.clicks,
        conversions: v.conversions,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch (err) {
    console.error('fetchCustomerSpendByDay error:', err)
    return null
  }
}
