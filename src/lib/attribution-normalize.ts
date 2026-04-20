/**
 * Normalização para cruzamento TinTim ↔ ERP (telefone / e-mail).
 */

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null
  const t = email.trim().toLowerCase()
  return t.length > 0 ? t : null
}

/** Dígitos finais (até 11) para comparar com WhatsApp cadastral. */
export function normalizePhoneDigits(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') return null
  const d = phone.replace(/\D/g, '')
  if (d.length < 10) return null
  if (d.length === 10 || d.length === 11) return d
  return d.slice(-11)
}

export function phonesLikelyMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePhoneDigits(a)
  const nb = normalizePhoneDigits(b)
  if (!na || !nb) return false
  return na === nb || na.endsWith(nb) || nb.endsWith(na)
}
