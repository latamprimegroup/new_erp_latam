/** Normaliza host a partir de uma URL absoluta (https). */
export function landingUrlToHost(landingUrl: string): { ok: true; host: string } | { ok: false; error: string } {
  const raw = landingUrl.trim()
  if (!raw) return { ok: false, error: 'URL vazia' }
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { ok: false, error: 'URL inválida' }
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { ok: false, error: 'Use http(s)://' }
  }
  const host = u.hostname.toLowerCase()
  if (!host || host.length > 253) {
    return { ok: false, error: 'Host inválido' }
  }
  return { ok: true, host }
}

export function proxyHostKeyFromParts(
  host: string | null | undefined,
  port: number | string | null | undefined,
): string | null {
  const h = (host || '').trim().toLowerCase()
  if (!h) return null
  const p = typeof port === 'string' ? parseInt(port, 10) : port
  if (p != null && !Number.isNaN(p) && p > 0) return `${h}:${p}`
  return h
}
