/** Extrai ano (19xx/20xx) de um rótulo de safra livre, ex.: "Safra 2014" ou "2014". */
export function parseHarvestYearFromSafra(safra: string | null | undefined): number | null {
  if (!safra) return null
  const m = safra.match(/\b(19|20)\d{2}\b/)
  if (!m) return null
  const y = parseInt(m[0], 10)
  if (y < 1995 || y > new Date().getFullYear()) return null
  return y
}

export function isVovoHarvestYear(year: number | null | undefined, now = new Date()): boolean {
  if (year == null || !Number.isFinite(year)) return false
  return now.getFullYear() - year >= 10
}
