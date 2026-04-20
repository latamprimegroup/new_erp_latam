/**
 * Mascaramento para UI — operador não vê dado bruto completo.
 */
export function maskEmail(email: string): string {
  const t = email.trim().toLowerCase()
  const at = t.indexOf('@')
  if (at <= 1) return '***'
  const local = t.slice(0, at)
  const domain = t.slice(at + 1)
  const vis = Math.min(3, Math.max(1, local.length - 4))
  return `${local.slice(0, vis)}***@${domain}`
}

export function maskCpf(cpfDigits: string): string {
  const d = cpfDigits.replace(/\D/g, '')
  if (d.length < 4) return '***'
  return `***.***.***-${d.slice(-2)}`
}

export function maskCnpj(cnpjDigits: string): string {
  const d = cnpjDigits.replace(/\D/g, '')
  if (d.length < 4) return '***'
  return `**.***.***/****-${d.slice(-2)}`
}

export function maskCardPan(panDigits: string): string {
  const d = panDigits.replace(/\D/g, '')
  if (d.length < 4) return '****'
  return `**** **** **** ${d.slice(-4)}`
}
