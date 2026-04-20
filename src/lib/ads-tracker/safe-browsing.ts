/**
 * Google Safe Browsing API v4 — deteta URLs listadas para malware / phishing / software indesejado.
 * Isto não indica “revisão Google Ads”; o rótulo na UI deixa isso explícito.
 */
export type SafeBrowsingResult =
  | { status: 'OK' }
  | { status: 'WARNING'; detail: string }
  | { status: 'SKIPPED'; detail: string }
  | { status: 'ERROR'; detail: string }

/** URL canónica para consultar o host na API (Safe Browsing espera URL completa). */
export function safeBrowsingUrlForDomainHost(host: string): string {
  const h = host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .split(':')[0]
  return `https://${h}/`
}

export async function checkUrlSafeBrowsing(landingUrl: string): Promise<SafeBrowsingResult> {
  const key = process.env.GOOGLE_SAFE_BROWSING_API_KEY?.trim()
  if (!key) {
    return { status: 'SKIPPED', detail: 'API key não configurada' }
  }

  const endpoint = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(key)}`
  const body = {
    client: { clientId: 'ads-ativos-erp', clientVersion: '1.0' },
    threatInfo: {
      threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
      platformTypes: ['ANY_PLATFORM'],
      threatEntryTypes: ['URL'],
      threatEntries: [{ url: landingUrl.slice(0, 2000) }],
    },
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return { status: 'ERROR', detail: `HTTP ${res.status}: ${t.slice(0, 120)}` }
    }
    const data = (await res.json()) as { matches?: unknown[] }
    if (Array.isArray(data.matches) && data.matches.length > 0) {
      return {
        status: 'WARNING',
        detail: 'URL presente nas listas Safe Browsing (malware/phishing/software indesejado).',
      }
    }
    return { status: 'OK' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'erro de rede'
    return { status: 'ERROR', detail: msg }
  }
}
