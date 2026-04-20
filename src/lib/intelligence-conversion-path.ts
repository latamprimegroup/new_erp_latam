/** Compara primeiro toque UTM vs último (ROI real por jornada). Inclui content/term quando existirem. */
export function buildConversionPathSummary(lead: {
  utmFirstSource: string | null
  utmFirstMedium?: string | null
  utmFirstCampaign: string | null
  utmFirstContent?: string | null
  utmFirstTerm?: string | null
  utmSource: string | null
  utmMedium?: string | null
  utmCampaign: string | null
  utmContent?: string | null
  utmTerm?: string | null
}): string {
  const seg = (
    source: string | null | undefined,
    medium: string | null | undefined,
    campaign: string | null | undefined,
    content: string | null | undefined,
    term: string | null | undefined,
  ) => {
    const core = `${source?.trim() || '—'} / ${campaign?.trim() || '—'}`
    const extra: string[] = []
    if (medium?.trim()) extra.push(`m:${medium.trim()}`)
    if (content?.trim()) extra.push(`c:${content.trim().slice(0, 80)}`)
    if (term?.trim()) extra.push(`t:${term.trim().slice(0, 60)}`)
    return extra.length ? `${core} (${extra.join(' · ')})` : core
  }

  const open = seg(
    lead.utmFirstSource,
    lead.utmFirstMedium,
    lead.utmFirstCampaign,
    lead.utmFirstContent,
    lead.utmFirstTerm,
  )
  const close = seg(lead.utmSource, lead.utmMedium, lead.utmCampaign, lead.utmContent, lead.utmTerm)
  if (open === close) return `Único toque: ${open}`
  return `Abertura: ${open} → Fecho: ${close}`
}
