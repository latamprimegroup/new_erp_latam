import { appPublicBaseUrl } from '@/lib/landing-vault/public-base-url'

export function trackerOfferPostbackUrl(postbackPublicToken: string): string | null {
  const base = appPublicBaseUrl()
  if (!base) return null
  return `${base}/api/public/tracker-offers/webhook/${encodeURIComponent(postbackPublicToken)}`
}

export function trackerOfferPayUrl(paySlug: string): string | null {
  const base = appPublicBaseUrl()
  if (!base) return null
  return `${base}/pay/${encodeURIComponent(paySlug)}`
}

/** Base pública do pay com hints para o edge (perfil SAFE/MONEY + nicho). */
export function mentoradoShieldPayBaseUrl(opts: {
  paySlug: string
  uniPrimaryHost: string | null | undefined
  shieldProfile: string
  protectionNiche: string
}): string | null {
  const rawHost = opts.uniPrimaryHost?.trim()
  const host = rawHost
    ? rawHost.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0]
    : ''
  const base = host ? `https://${host}` : appPublicBaseUrl()
  if (!base) return null
  const u = new URL(`${base}/pay/${encodeURIComponent(opts.paySlug)}`)
  u.searchParams.set('shield_profile', opts.shieldProfile.slice(0, 16))
  u.searchParams.set('shield_ctx', opts.protectionNiche.slice(0, 48))
  return u.toString()
}
