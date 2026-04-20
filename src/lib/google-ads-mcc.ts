/**
 * Google Ads — visão MCC (lista de contas linkadas + métricas GAQL por cliente).
 * Credenciais apenas server-side (mesmas env que `google-ads.ts`).
 */
import { isGoogleAdsConfigured } from './google-ads'

export type MccLinkedClient = {
  googleCustomerId: string
  descriptiveName: string
  statusLabel: string
  isManager: boolean
}

export type MccClientEnriched = MccLinkedClient & {
  impressions7d: number
  conversions7d: number
  costMicros7d: bigint
  hasDisapprovedAd: boolean
  travado: boolean
  caiu: boolean
  gastando: boolean
  vendendo: boolean
}

function normalizeCustomerId(id: string): string {
  return id.replace(/\D/g, '')
}

function extractCustomerIdFromResource(resourceName: string | undefined | null): string | null {
  if (!resourceName) return null
  const s = String(resourceName)
  const m = s.match(/customers\/(\d+)/)
  if (m) return m[1]
  const digits = s.replace(/\D/g, '')
  return digits.length >= 6 ? digits : null
}

function mapCustomerStatusLabel(v: unknown): string {
  if (v === null || v === undefined) return 'UNKNOWN'
  if (typeof v === 'string') {
    const u = v.toUpperCase()
    if (u.includes('ENABLED')) return 'ENABLED'
    if (u.includes('SUSPENDED')) return 'SUSPENDED'
    if (u.includes('PENDING_VERIFICATION')) return 'PENDING_VERIFICATION'
    if (u.includes('CANCELED') || u.includes('CANCELLED')) return 'CANCELED'
    if (u.includes('CLOSED')) return 'CLOSED'
    return u.replace(/\s/g, '_')
  }
  const n = Number(v)
  const byNum: Record<number, string> = {
    0: 'UNSPECIFIED',
    1: 'UNKNOWN',
    2: 'ENABLED',
    3: 'SUSPENDED',
    4: 'CANCELED',
    5: 'CLOSED',
    6: 'PENDING_VERIFICATION',
  }
  return byNum[n] ?? `UNKNOWN_${v}`
}

function last7dRange(): { start: string; end: string } {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 6)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

async function getAdsEnvCustomerFactory() {
  const token = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
  if (!token || !clientId || !clientSecret || !refreshToken || !loginCustomerId) {
    return null
  }
  const { GoogleAdsApi } = await import('google-ads-api')
  const loginNorm = normalizeCustomerId(loginCustomerId)
  const client = new GoogleAdsApi({
    client_id: clientId,
    client_secret: clientSecret,
    developer_token: token,
  })
  return {
    client,
    refreshToken,
    loginNorm,
    customerFor(id: string) {
      return client.Customer({
        customer_id: normalizeCustomerId(id),
        login_customer_id: loginNorm,
        refresh_token: refreshToken,
      })
    },
  }
}

/**
 * Lista contas linkadas ao MCC (nível 1, não ocultas).
 */
export async function listMccLinkedClients(): Promise<MccLinkedClient[] | null> {
  if (!isGoogleAdsConfigured()) return null
  const env = await getAdsEnvCustomerFactory()
  if (!env) return null
  const { customerFor, loginNorm } = env
  const mcc = customerFor(loginNorm)
  try {
    const rows = await mcc.query(`
      SELECT
        customer_client.client_customer,
        customer_client.descriptive_name,
        customer_client.status,
        customer_client.manager,
        customer_client.hidden
      FROM customer_client
      WHERE
        customer_client.level = 1
        AND customer_client.hidden = FALSE
    `)
    const out: MccLinkedClient[] = []
    for (const row of rows || []) {
      const cc = (row as { customer_client?: Record<string, unknown> }).customer_client
      if (!cc) continue
      const id = extractCustomerIdFromResource(cc.client_customer as string)
      if (!id || id === loginNorm) continue
      out.push({
        googleCustomerId: id,
        descriptiveName: String(cc.descriptive_name ?? id),
        statusLabel: mapCustomerStatusLabel(cc.status),
        isManager: cc.manager === true,
      })
    }
    return out
  } catch (e) {
    console.error('listMccLinkedClients:', e)
    return null
  }
}

async function fetchClientMetrics7d(
  env: NonNullable<Awaited<ReturnType<typeof getAdsEnvCustomerFactory>>>,
  googleCustomerId: string
): Promise<{ impressions: number; conversions: number; costMicros: bigint }> {
  const { start, end } = last7dRange()
  const customer = env.customerFor(googleCustomerId)
  try {
    const rows = await customer.query(`
      SELECT
        metrics.impressions,
        metrics.conversions,
        metrics.cost_micros
      FROM customer
      WHERE segments.date BETWEEN '${start}' AND '${end}'
    `)
    let impressions = 0
    let conversions = 0
    let costMicros = BigInt(0)
    for (const row of rows || []) {
      const m = (row as { metrics?: Record<string, unknown> }).metrics
      if (!m) continue
      impressions += Number(m.impressions ?? 0)
      conversions += Number(m.conversions ?? 0)
      costMicros += BigInt(Number(m.cost_micros ?? 0))
    }
    return { impressions, conversions, costMicros }
  } catch {
    return { impressions: 0, conversions: 0, costMicros: BigInt(0) }
  }
}

async function fetchHasDisapprovedAd(
  env: NonNullable<Awaited<ReturnType<typeof getAdsEnvCustomerFactory>>>,
  googleCustomerId: string
): Promise<boolean> {
  const customer = env.customerFor(googleCustomerId)
  try {
    const rows = await customer.query(`
      SELECT ad_group_ad.resource_name
      FROM ad_group_ad
      WHERE ad_group_ad.policy_summary.approval_status = 'DISAPPROVED'
      LIMIT 1
    `)
    return Array.isArray(rows) && rows.length > 0
  } catch {
    return false
  }
}

async function mapPool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit)
    out.push(...(await Promise.all(chunk.map(fn))))
  }
  return out
}

/**
 * Enriquece cada cliente com GAQL (últimos 7 dias) + flag de anúncio reprovado.
 */
export async function enrichMccClients(clients: MccLinkedClient[]): Promise<MccClientEnriched[] | null> {
  if (!isGoogleAdsConfigured() || clients.length === 0) return []
  const env = await getAdsEnvCustomerFactory()
  if (!env) return null

  const enriched = await mapPool(clients, 6, async (c) => {
    if (c.isManager) {
      const travado = c.statusLabel === 'SUSPENDED'
      return {
        ...c,
        impressions7d: 0,
        conversions7d: 0,
        costMicros7d: BigInt(0),
        hasDisapprovedAd: false,
        travado,
        caiu: false,
        gastando: false,
        vendendo: false,
      } satisfies MccClientEnriched
    }
    const [metrics, hasDisapprovedAd] = await Promise.all([
      fetchClientMetrics7d(env, c.googleCustomerId),
      fetchHasDisapprovedAd(env, c.googleCustomerId),
    ])
    const travado = c.statusLabel === 'SUSPENDED'
    const enabled = c.statusLabel === 'ENABLED'
    const zeroSpend =
      metrics.impressions === 0 && metrics.conversions === 0 && metrics.costMicros === BigInt(0)
    const caiu = enabled && (hasDisapprovedAd || zeroSpend)
    const gastando = enabled && metrics.impressions > 0
    const vendendo = enabled && metrics.conversions > 0
    return {
      ...c,
      impressions7d: metrics.impressions,
      conversions7d: metrics.conversions,
      costMicros7d: metrics.costMicros,
      hasDisapprovedAd,
      travado,
      caiu,
      gastando,
      vendendo,
    } satisfies MccClientEnriched
  })

  return enriched
}

export type PauseCampaignsResult = { paused: number; errors?: string }

/**
 * Pausa todas as campanhas ENABLED nas contas indicadas (via API; server-only).
 */
export async function pauseAllEnabledCampaignsForCustomers(
  googleCustomerIds: string[]
): Promise<PauseCampaignsResult> {
  if (!isGoogleAdsConfigured() || googleCustomerIds.length === 0) {
    return { paused: 0, errors: 'Google Ads não configurado ou lista vazia.' }
  }
  const env = await getAdsEnvCustomerFactory()
  if (!env) return { paused: 0, errors: 'Credenciais incompletas.' }

  const { enums } = await import('google-ads-api')
  let paused = 0
  const errMsgs: string[] = []

  for (const rawId of googleCustomerIds) {
    const id = normalizeCustomerId(rawId)
    if (!id) continue
    const customer = env.customerFor(id)
    try {
      const rows = await customer.query(`
        SELECT campaign.resource_name, campaign.status
        FROM campaign
        WHERE campaign.status = 'ENABLED'
      `)
      const ops: Array<{
        entity: 'campaign'
        operation: 'update'
        resource: { resource_name: string; status: number }
      }> = []
      for (const row of rows || []) {
        const camp = (row as { campaign?: { resource_name?: string } }).campaign
        const rn = camp?.resource_name
        if (!rn) continue
        ops.push({
          entity: 'campaign',
          operation: 'update',
          resource: { resource_name: rn, status: enums.CampaignStatus.PAUSED },
        })
      }
      if (ops.length > 0) {
        await customer.mutateResources(ops)
        paused += ops.length
      }
    } catch (e) {
      console.error('pauseAllEnabledCampaignsForCustomers', id, e)
      errMsgs.push(`${id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { paused, errors: errMsgs.length ? errMsgs.slice(0, 5).join(' | ') : undefined }
}

export function isBadStatusForRecovery(prev: string): boolean {
  return prev === 'SUSPENDED' || prev === 'PENDING_VERIFICATION'
}

export function isRecoveredStatus(now: string): boolean {
  return now === 'ENABLED'
}
