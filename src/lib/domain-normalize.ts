/**
 * Normaliza domínio/URL para unicidade (footprint): sem protocolo, sem path, lowercase.
 */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input || !String(input).trim()) return null
  let s = String(input).trim().toLowerCase()
  try {
    if (s.includes('://')) {
      const u = new URL(s.startsWith('http') ? s : `https://${s}`)
      s = u.hostname
    } else {
      s = s.replace(/^www\./, '').split('/')[0] ?? s
    }
  } catch {
    s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] ?? s
  }
  s = s.replace(/^www\./, '').replace(/[.:]+$/, '')
  return s.length > 0 ? s : null
}
