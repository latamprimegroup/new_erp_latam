/**
 * Esteira de upsell: produtos complementares por slug normalizado.
 * Ajuste via env UPSELL_MATRIX_JSON: {"produto-a":["produto-b"]}
 */
const DEFAULT_UPSELL: Record<string, string[]> = {
  '*': ['upsell-complemento', 'pacote-expansao'],
}

function loadMatrix(): Record<string, string[]> {
  const raw = process.env.UPSELL_MATRIX_JSON
  if (!raw?.trim()) return DEFAULT_UPSELL
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(o)) {
      if (Array.isArray(v)) out[k.toLowerCase()] = v.map(String)
    }
    return Object.keys(out).length ? out : DEFAULT_UPSELL
  } catch {
    return DEFAULT_UPSELL
  }
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '-')
}

/** Lista de slugs sugeridos que o cliente ainda não comprou */
export function suggestUpsellSlugs(ownedRaw: unknown): string[] {
  const matrix = loadMatrix()
  const owned = new Set<string>()
  if (Array.isArray(ownedRaw)) {
    for (const x of ownedRaw) owned.add(norm(String(x)))
  }
  const suggestions = new Set<string>()
  for (const slug of owned) {
    const next = matrix[slug] || matrix['*'] || []
    for (const n of next) suggestions.add(norm(n))
  }
  if (suggestions.size === 0) {
    for (const n of matrix['*'] || []) suggestions.add(norm(n))
  }
  return [...suggestions].filter((s) => !owned.has(s))
}
