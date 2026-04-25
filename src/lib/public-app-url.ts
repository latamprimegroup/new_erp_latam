/** URL pública canônica da app para links externos. */
const DEFAULT_PRODUCTION_BASE_URL = 'https://www.adsativos.com'

function normalizeCandidate(raw: string | null | undefined) {
  const value = String(raw ?? '').trim()
  if (!value) return null
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`
  try {
    const parsed = new URL(withProtocol)
    return `${parsed.protocol}//${parsed.host}`.replace(/\/$/, '')
  } catch {
    return null
  }
}

function isVercelPreviewUrl(url: string | null) {
  if (!url) return false
  try {
    return new URL(url).hostname.endsWith('.vercel.app')
  } catch {
    return false
  }
}

/**
 * Retorna base URL pública para gerar links enviados ao cliente final.
 * Em produção, evita fallback para domínio preview da Vercel.
 */
export function getPublicAppBaseUrl(fallbackOrigin?: string | null): string {
  const explicitCandidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXTAUTH_URL,
    process.env.APP_BASE_URL,
    fallbackOrigin ?? null,
  ]
    .map(normalizeCandidate)
    .filter(Boolean) as string[]

  const firstExplicit = explicitCandidates[0] ?? null
  const firstNonVercel = explicitCandidates.find((url) => !isVercelPreviewUrl(url)) ?? null

  if (process.env.NODE_ENV !== 'production') {
    return firstExplicit
      || normalizeCandidate(process.env.VERCEL_URL)
      || 'http://localhost:3000'
  }

  const vercelFallback = normalizeCandidate(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
    || process.env.VERCEL_URL
    || null,
  )

  return firstNonVercel
    || (isVercelPreviewUrl(firstExplicit) ? null : firstExplicit)
    || (isVercelPreviewUrl(vercelFallback) ? null : vercelFallback)
    || DEFAULT_PRODUCTION_BASE_URL
}
