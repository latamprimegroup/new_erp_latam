/**
 * Sanitização de texto para cadastro ADS CORE (endereço, razão social, etc.).
 * Inspirada em fluxos tipo receita-tools / Leads2b: NFKC, remoção de controles,
 * colapso de espaços e vírgulas duplicadas.
 */
const CTRL = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g

export function sanitizeAdsCoreTextField(raw: string | null | undefined): string | null {
  if (raw == null) return null
  let s = String(raw).normalize('NFKC').replace(CTRL, '')
  s = s.replace(/\s+/g, ' ').trim()
  return s.length ? s : null
}

/** Monta endereço a partir de partes e aplica sanitização final. */
export function sanitizeAdsCoreAddressFromParts(parts: (string | null | undefined)[]): string | null {
  const joined = parts
    .map((p) => sanitizeAdsCoreTextField(p))
    .filter((x): x is string => !!x)
    .join(', ')
  return sanitizeAdsCoreAddress(joined)
}

export function sanitizeAdsCoreAddress(raw: string | null | undefined): string | null {
  const base = sanitizeAdsCoreTextField(raw)
  if (!base) return null
  return base
    .replace(/[,|;]{2,}/g, ', ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/^,\s*|,\s*$/g, '')
    .trim() || null
}
