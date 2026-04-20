import { createHash } from 'crypto'

/**
 * Hash estável (IP + UA) para deteção de duplicados sem guardar IP em claro.
 * Usa o primeiro IP de x-forwarded-for quando existir.
 */
export function buildLeadFingerprint(ipHint: string | null, userAgent: string | null): {
  hash: string | null
  userAgentStored: string | null
} {
  const ua = userAgent?.trim().slice(0, 512) || null
  const ip = ipHint?.trim() || ''
  if (!ip && !ua) return { hash: null, userAgentStored: ua }
  const raw = `${ip}|${ua || ''}`
  const hash = createHash('sha256').update(raw, 'utf8').digest('hex')
  return { hash, userAgentStored: ua }
}

export function clientIpFromHeaders(h: Headers): string | null {
  const xff = h.get('x-forwarded-for') || h.get('X-Forwarded-For')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const real = h.get('x-real-ip') || h.get('X-Real-IP')
  if (real?.trim()) return real.trim()
  return null
}
