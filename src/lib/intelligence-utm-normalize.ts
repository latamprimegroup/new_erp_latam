/** Alinhar chaves com analytics (vazio → label fixo). */
export function normalizeUtmSource(raw: string | null | undefined): string {
  const s = raw?.trim()
  return s && s.length ? s.slice(0, 120) : '(sem fonte)'
}

export function normalizeUtmCampaign(raw: string | null | undefined): string {
  const s = raw?.trim()
  return s && s.length ? s.slice(0, 200) : '(sem campanha)'
}

export function campaignSpendKey(utmSource: string, utmCampaign: string): string {
  return `${normalizeUtmSource(utmSource)}||${normalizeUtmCampaign(utmCampaign)}`
}
