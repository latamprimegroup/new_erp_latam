/**
 * UTM Tracker — Ads Ativos War Room OS
 *
 * Captura, persiste e recupera todos os parâmetros de rastreio de uma sessão.
 *
 * Parâmetros capturados:
 *   utm_source, utm_medium, utm_campaign, utm_content, utm_term
 *   src          — parâmetro proprietário Utmify
 *   fbclid       — ID de clique do Facebook/Instagram Ads (iOS14+ compatible)
 *   gclid        — ID de clique do Google Ads
 *   referrer     — fallback quando não há UTMs (detecta tráfego orgânico/social)
 *
 * Estratégia de persistência (blindagem iOS14+):
 *   1. Cookie first-party (30 dias, SameSite=Lax)
 *   2. localStorage (30 dias)
 *   → Merge: URL atual (prioridade máxima) > cookie > localStorage > referrer
 *
 * Uso:
 *   // Em qualquer componente React:
 *   import { captureUtms, getPersistedUtms, UTM_PAYLOAD_KEYS } from '@/lib/utm-tracker'
 *   const utms = captureUtms() // captura + persiste ao montar
 *
 *   // Para enviar no checkout:
 *   const payload = buildUtmPayload(utms)
 */

export const UTM_PARAM_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign',
  'utm_content', 'utm_term', 'src',
  'fbclid', 'gclid',
] as const

export type UtmParamKey = typeof UTM_PARAM_KEYS[number]

export type UtmData = {
  utm_source:   string | null
  utm_medium:   string | null
  utm_campaign: string | null
  utm_content:  string | null
  utm_term:     string | null
  src:          string | null
  fbclid:       string | null
  gclid:        string | null
  referrer:     string | null
  capturedAt:   number
}

const LS_KEY     = 'aa_utms_v2'        // chave localStorage
const COOKIE_KEY = 'aa_utms'           // nome do cookie first-party
const TTL_MS     = 30 * 24 * 3600_000  // 30 dias em ms
const EMPTY: UtmData = {
  utm_source: null, utm_medium: null, utm_campaign: null,
  utm_content: null, utm_term: null, src: null,
  fbclid: null, gclid: null, referrer: null, capturedAt: 0,
}

// ─── Cookie helpers (SSR-safe) ────────────────────────────────────────────────

function setCookie(value: string, ttlDays = 30): void {
  if (typeof document === 'undefined') return
  const exp = new Date(Date.now() + ttlDays * 86_400_000).toUTCString()
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax`
}

function getCookie(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_KEY}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : null
}

// ─── Serialização ─────────────────────────────────────────────────────────────

function serialize(data: UtmData): string {
  return JSON.stringify(data)
}

function deserialize(raw: string | null): UtmData | null {
  if (!raw) return null
  try {
    const d = JSON.parse(raw) as UtmData
    // Valida TTL
    if (d.capturedAt && Date.now() - d.capturedAt > TTL_MS) return null
    return d
  } catch {
    return null
  }
}

// ─── Persistência ─────────────────────────────────────────────────────────────

function saveUtms(data: UtmData): void {
  const raw = serialize(data)
  // 1. localStorage
  try { localStorage.setItem(LS_KEY, raw) } catch { /* incognito / SSR */ }
  // 2. Cookie first-party
  setCookie(raw)
}

/** Recupera UTMs armazenados (cookie > localStorage) */
export function getPersistedUtms(): UtmData | null {
  // Prioriza cookie (mais resistente a limpeza de storage)
  const fromCookie = deserialize(getCookie())
  if (fromCookie) return fromCookie

  // Fallback: localStorage
  try {
    const fromLs = deserialize(localStorage.getItem(LS_KEY))
    if (fromLs) return fromLs
  } catch { /* noop */ }

  return null
}

// ─── Captura da URL ───────────────────────────────────────────────────────────

function parseUrlParams(): Partial<UtmData> {
  if (typeof window === 'undefined') return {}
  const sp     = new URLSearchParams(window.location.search)
  const result: Partial<UtmData> = {}
  for (const key of UTM_PARAM_KEYS) {
    const val = sp.get(key) ?? sp.get(key.replace('utm_', ''))
    if (val && val.trim()) result[key] = val.trim()
  }
  return result
}

/**
 * Fallback de referrer — classifica a origem quando não há UTMs.
 *
 * Retorna:
 *   null            — quando há UTMs (não precisamos do referrer)
 *   "direct"        — sem referrer + sem UTMs
 *   "organic:google"— google.com sem gclid
 *   "social:facebook" — facebook.com sem fbclid
 *   "organic:X"     — qualquer domínio conhecido
 *   "referral:dominio.com" — domínio desconhecido
 */
function classifyReferrer(hasUtms: boolean): string | null {
  if (hasUtms || typeof document === 'undefined') return null
  const ref = document.referrer
  if (!ref) return 'direct'

  try {
    const host = new URL(ref).hostname.replace('www.', '')
    if (/google\./i.test(host))    return 'organic:google'
    if (/bing\./i.test(host))      return 'organic:bing'
    if (/facebook\./i.test(host))  return 'social:facebook'
    if (/instagram\./i.test(host)) return 'social:instagram'
    if (/tiktok\./i.test(host))    return 'social:tiktok'
    if (/youtube\./i.test(host))   return 'social:youtube'
    if (/twitter|x\.com/i.test(host)) return 'social:twitter'
    if (/linkedin\./i.test(host))  return 'social:linkedin'
    if (/kwai\./i.test(host))      return 'social:kwai'
    if (/t\.me|telegram/i.test(host)) return 'social:telegram'
    return `referral:${host}`
  } catch {
    return `referral:${document.referrer.slice(0, 100)}`
  }
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Captura UTMs da URL atual, mescla com dados persistidos e salva.
 *
 * Regras de merge:
 *   - Parâmetros da URL atual têm PRIORIDADE ABSOLUTA
 *   - Se a URL não tem UTMs, usa os dados persistidos (30 dias)
 *   - Se não há nada, usa referrer como fallback
 *
 * Chame no mount do componente de checkout.
 */
export function captureUtms(): UtmData {
  const fromUrl  = parseUrlParams()
  const stored   = getPersistedUtms()

  const hasUrlUtms = UTM_PARAM_KEYS.some((k) => fromUrl[k])

  // Merge: URL > stored > vazio
  const merged: UtmData = {
    utm_source:   fromUrl.utm_source   ?? stored?.utm_source   ?? null,
    utm_medium:   fromUrl.utm_medium   ?? stored?.utm_medium   ?? null,
    utm_campaign: fromUrl.utm_campaign ?? stored?.utm_campaign ?? null,
    utm_content:  fromUrl.utm_content  ?? stored?.utm_content  ?? null,
    utm_term:     fromUrl.utm_term     ?? stored?.utm_term     ?? null,
    src:          fromUrl.src          ?? stored?.src          ?? null,
    fbclid:       fromUrl.fbclid       ?? stored?.fbclid       ?? null,
    gclid:        fromUrl.gclid        ?? stored?.gclid        ?? null,
    referrer:     stored?.referrer     ?? classifyReferrer(!hasUrlUtms && !stored?.utm_source),
    capturedAt:   hasUrlUtms ? Date.now() : (stored?.capturedAt ?? Date.now()),
  }

  // Persiste apenas se há dados novos da URL (para não sobrescrever com sessão vazia)
  if (hasUrlUtms) {
    saveUtms(merged)
  } else if (!stored) {
    // Primeira visita sem UTMs — persiste pelo menos o referrer
    saveUtms(merged)
  }

  return merged
}

// ─── Builder de payload para o backend ───────────────────────────────────────

/** Converte UtmData para o formato do backend (QuickSaleCheckout / CheckoutPixRoute) */
export function buildUtmPayload(utms: UtmData): {
  utmSource:   string | null
  utmMedium:   string | null
  utmCampaign: string | null
  utmContent:  string | null
  utmTerm:     string | null
  utmSrc:      string | null
  fbclid:      string | null
  gclid:       string | null
  referrer:    string | null
} {
  return {
    utmSource:   utms.utm_source,
    utmMedium:   utms.utm_medium,
    utmCampaign: utms.utm_campaign,
    utmContent:  utms.utm_content,
    utmTerm:     utms.utm_term,
    utmSrc:      utms.src,
    fbclid:      utms.fbclid,
    gclid:       utms.gclid,
    referrer:    utms.referrer,
  }
}

/** Verifica se a sessão tem algum dado de atribuição */
export function hasAttribution(utms: UtmData): boolean {
  return !!(utms.utm_source || utms.utm_campaign || utms.fbclid || utms.gclid || utms.referrer)
}

/** Retorna descrição legível da origem para logs/debug */
export function describeSource(utms: UtmData): string {
  if (utms.gclid)          return `Google Ads (gclid)`
  if (utms.fbclid)         return `Meta Ads (fbclid)`
  if (utms.utm_source)     return `${utms.utm_source}/${utms.utm_medium ?? 'unknown'}`
  if (utms.referrer)       return utms.referrer
  return 'direto'
}
