import type { TrafficParamBlueprint } from '@/lib/ads-tracker/traffic-source-types'
import { classifyQueryString } from '@/lib/ads-tracker/traffic-query-classify'

const RECOMMENDED_MAX_URL = 2048

export type BuildTrackingUrlResult = {
  url: string
  warnings: string[]
  length: number
  attributionPreview: ReturnType<typeof classifyQueryString>
}

function safeUrl(base: string): URL | null {
  const trimmed = base.trim()
  if (!trimmed) return null
  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
}

/**
 * Monta URL final com UTMs, pares custom (ValueTrack) e globais.
 * Com assumeAutoTagging=true (Google), o GCLID não é colado no builder — vem do auto-tagging da conta.
 */
export function buildTrackingUrl(
  baseUrl: string,
  blueprint: TrafficParamBlueprint,
  globalParams: Record<string, string>,
  overrides: Record<string, string> = {}
): BuildTrackingUrlResult {
  const warnings: string[] = []
  const u = safeUrl(baseUrl)
  if (!u) {
    return {
      url: '',
      warnings: ['URL base inválida ou vazia.'],
      length: 0,
      attributionPreview: 'direct',
    }
  }

  const apply = (k: string, v: string) => {
    if (!k || v === '') return
    u.searchParams.set(k, v)
  }

  for (const [k, v] of Object.entries(globalParams)) {
    apply(k, v)
  }
  for (const [k, v] of Object.entries(overrides)) {
    apply(k, v)
  }

  for (const [k, v] of Object.entries(blueprint.utm)) {
    if (v != null && String(v).trim() !== '') {
      apply(k, String(v).trim())
    }
  }

  for (const p of blueprint.customPairs) {
    apply(p.key, p.value)
  }

  const clickKey = blueprint.clickIdParam.trim()
  if (clickKey && !blueprint.assumeAutoTagging) {
    warnings.push(
      `Auto-tagging OFF: confirma na conta Google Ads; o builder não cola GCLID fixo. O parâmetro de referência é «${clickKey}».`
    )
  }

  if (!u.searchParams.get('utm_source')) {
    warnings.push('Falta utm_source na URL gerada — recomendado para consistência de relatórios.')
  }

  const out = u.toString()
  const length = out.length
  if (length > RECOMMENDED_MAX_URL) {
    warnings.push(
      `URL com ${length} caracteres (limite prático recomendado ${RECOMMENDED_MAX_URL}). Risco de truncagem em alguns browsers ou relatórios.`
    )
  }

  const attributionPreview = classifyQueryString(u.searchParams)

  if (blueprint.assumeAutoTagging && clickKey === 'gclid') {
    const base =
      'Auto-tagging Google: o gclid não vai na URL gerada; o Google acrescenta no clique — não uses {gclid} estático na Final URL.'
    warnings.push(
      attributionPreview !== 'paid_google'
        ? `${base} Pré-visualização sem gclid: «${attributionPreview}».`
        : base
    )
  }

  return { url: out, warnings, length, attributionPreview }
}
