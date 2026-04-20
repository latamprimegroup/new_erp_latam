import crypto from 'crypto'

export type AdsTrackerEdgeAction =
  | 'pause_route'
  | 'delete_route'
  | 'emergency_contingency'
  | 'resume_route'

export type AdsTrackerEdgePayload = {
  version: 1
  action: AdsTrackerEdgeAction
  campaignId: string
  campaignName: string
  domainHost: string
  landingUrl: string
  uniId: string
  at: string
}

function resolveGlobalUrl(): string | null {
  const u = process.env.ADS_TRACKER_EDGE_WEBHOOK_URL?.trim()
  return u || null
}

/**
 * Notifica o servidor de borda configurado (global ou override por campanha).
 * O ERP não define o que o edge serve — apenas envia o evento operacional.
 */
export async function notifyAdsTrackerEdge(opts: {
  overrideUrl?: string | null
  secret?: string | null
  payload: AdsTrackerEdgePayload
}): Promise<{ ok: boolean; skipped: boolean; status?: number; error?: string }> {
  const url = (opts.overrideUrl?.trim() || resolveGlobalUrl()) ?? null
  if (!url) {
    return { ok: true, skipped: true }
  }

  const body = JSON.stringify(opts.payload)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'AdsAtivosTracker/1.0',
  }
  const secret = opts.secret?.trim() || process.env.ADS_TRACKER_EDGE_WEBHOOK_SECRET?.trim()
  if (secret) {
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
    headers['X-Ads-Tracker-Signature'] = `sha256=${sig}`
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return { ok: false, skipped: false, status: res.status, error: t.slice(0, 200) }
    }
    return { ok: true, skipped: false, status: res.status }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fetch failed'
    return { ok: false, skipped: false, error: msg }
  }
}
