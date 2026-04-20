/**
 * Congruência CNAE × nicho (ADS CORE / G2).
 */

export function cnaeRoot7(raw: string | null | undefined): string | null {
  if (!raw || !String(raw).trim()) return null
  const d = String(raw).replace(/\D/g, '')
  if (d.length < 4) return null
  return d.slice(0, 7)
}

export function normalizeAllowedCnaeInput(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function rootsFromConsulta(c: {
  cnae: string | null
  cnaeSecundarios?: string[] | null
}): string[] {
  const set = new Set<string>()
  const r0 = cnaeRoot7(c.cnae)
  if (r0) set.add(r0)
  for (const s of c.cnaeSecundarios || []) {
    const r = cnaeRoot7(s)
    if (r) set.add(r)
  }
  return [...set]
}

/** Lista vazia = não restringe (nichos legados). */
export function nicheAllowsCompanyRoots(allowedCodes: string[], companyRoots: string[]): boolean {
  const allowedRoots = [
    ...new Set(
      allowedCodes.map((c) => cnaeRoot7(c)).filter((x): x is string => !!x)
    ),
  ]
  if (allowedRoots.length === 0) return true
  const roots = [...new Set(companyRoots)]
  if (roots.length === 0) return false
  for (const r of roots) {
    for (const a of allowedRoots) {
      if (r === a) return true
      if (a.length >= 4 && r.startsWith(a)) return true
      if (r.length >= 4 && a.startsWith(r)) return true
    }
  }
  return false
}

export const ADS_CORE_CNAE_INCONGRUENTE_MSG =
  'Atenção: Atividade econômica incompatível com o nicho selecionado.'

/** Texto genérico (ex.: importação em lote sem nome do nicho no contexto). */
export const ADS_CORE_G2_RISCO_INCONGRUENCIA_MSG =
  'Atenção: Este CNPJ não possui atividade econômica compatível com o nicho selecionado. Risco de reprovação G2.'

/** Mensagem da especificação Ads Ativos (modal de confirmação no cadastro). */
export function buildAdsCoreCnaeIncongruenceQuestion(nicheDisplayName: string): string {
  const n = nicheDisplayName.trim() || 'este nicho'
  return `Atenção: Este CNPJ não possui atividade econômica compatível com ${n}. Deseja prosseguir?`
}

function normalizeMatchText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Texto para cruzar palavras-chave do nicho com descrição de atividade */
export function buildCnaeFuzzyText(input: {
  razaoSocial: string | null | undefined
  nomeFantasia: string | null | undefined
  cnaeDescricao: string | null | undefined
  cnaeSecundarios: string[] | null | undefined
}): string {
  const parts = [
    input.razaoSocial,
    input.nomeFantasia,
    input.cnaeDescricao,
    ...(input.cnaeSecundarios || []),
  ]
  return normalizeMatchText(parts.filter(Boolean).join(' '))
}

/**
 * Congruência completa: raízes CNAE permitidas OU palavras-chave no texto fiscal.
 * Nicho sem regras (lista vazia) = não restringe (legado).
 */
export function nicheCongruenceComplete(
  allowedCodes: string[],
  companyRoots: string[],
  keywords: string[],
  fuzzyText: string
): { ok: boolean; byCode: boolean; byKeyword: boolean } {
  const allowedRoots = [
    ...new Set(allowedCodes.map((c) => cnaeRoot7(c)).filter((x): x is string => !!x)),
  ]
  const hasCnaeRules = allowedRoots.length > 0
  const kws = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))]
  const hasKeywordRules = kws.length > 0
  if (!hasCnaeRules && !hasKeywordRules) {
    return { ok: true, byCode: true, byKeyword: false }
  }
  const byCode = hasCnaeRules && nicheAllowsCompanyRoots(allowedCodes, companyRoots)
  if (byCode) return { ok: true, byCode: true, byKeyword: false }
  if (!hasKeywordRules) return { ok: false, byCode: false, byKeyword: false }
  const t = normalizeMatchText(fuzzyText)
  for (const kw of kws) {
    const k = normalizeMatchText(kw)
    if (k.length >= 2 && t.includes(k)) {
      return { ok: true, byCode: false, byKeyword: true }
    }
  }
  return { ok: false, byCode: false, byKeyword: false }
}

export function isReceitaSituacaoAtiva(situacao: string | null | undefined): boolean {
  if (!situacao || !String(situacao).trim()) return false
  const x = String(situacao)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
  return x === 'ATIVA' || x === 'ATIVO'
}

export const ADS_CORE_RECEITA_NAO_ATIVA_MSG =
  'Este CNPJ não está ATIVO na Receita Federal e não pode ser utilizado.'
