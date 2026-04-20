/**
 * Utilitários compartilhados do ADS CORE (CNPJ, URL, uploads de documento).
 */

export const ADS_CORE_DOC_TYPES = ['cnpj', 'rg-frente', 'rg-verso'] as const
export type AdsCoreDocType = (typeof ADS_CORE_DOC_TYPES)[number]

export const ADS_CORE_MAX_UPLOAD = 15 * 1024 * 1024

export const ADS_CORE_UPLOAD_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

/** Pré-validação / insert / violação UNIQUE (Prisma P2002) — CNPJ ou site em outro ativo. */
export const ADS_CORE_DUPLICATE_MSG = 'Dado já utilizado em outra conta.'

/** @deprecated Use `ADS_CORE_DUPLICATE_MSG`. */
export const ADS_CORE_UNIQUE_DB_MSG = ADS_CORE_DUPLICATE_MSG

/** @deprecated Use `ADS_CORE_DUPLICATE_MSG`. */
export const ADS_CORE_URL_FOOTPRINT_MSG = ADS_CORE_DUPLICATE_MSG

/** URL já constou em outro ativo (histórico de alterações). */
export const ADS_CORE_URL_HISTORICO_MSG =
  'Este Domínio/URL já foi utilizado anteriormente e não pode ser repetido por questões de contingência.'

export function normalizeAdsCoreCnpj(raw: string): string {
  return String(raw).replace(/\D/g, '')
}

/**
 * Canonicaliza URL salva em `site_url` e usada na checagem de unicidade.
 * Força https, hostname em minúsculas, sem query/hash; remove barra final redundante.
 */
export function normalizeAdsCoreSiteUrl(raw: string | undefined | null): string | null {
  if (raw == null || !String(raw).trim()) return null
  let s = String(raw).trim()
  try {
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`
    const u = new URL(s)
    u.protocol = 'https:'
    u.hostname = u.hostname.toLowerCase()
    u.hash = ''
    u.search = ''
    let out = u.toString()
    if (out.endsWith('/') && u.pathname === '/') {
      out = out.slice(0, -1)
    }
    return out
  } catch {
    return null
  }
}

export function formatCnpjDisplay(digitsOrRaw: string): string {
  const d = normalizeAdsCoreCnpj(digitsOrRaw)
  if (d.length !== 14) return digitsOrRaw
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}
