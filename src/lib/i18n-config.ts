/** Locales suportados na área do cliente */
export const APP_LOCALES = ['pt-BR', 'en-US', 'es'] as const
export type AppLocale = (typeof APP_LOCALES)[number]

export const LOCALE_COOKIE = 'NEXT_LOCALE'
export const LOCALE_STORAGE_KEY = 'NEXT_LOCALE'

export const LOCALE_LABELS: Record<AppLocale, { flag: string; name: string }> = {
  'pt-BR': { flag: '🇧🇷', name: 'Português' },
  'en-US': { flag: '🇺🇸', name: 'English' },
  es: { flag: '🇪🇸', name: 'Español' },
}

export function normalizeLocale(raw: string | null | undefined): AppLocale {
  if (!raw) return 'pt-BR'
  const s = raw.trim()
  if (APP_LOCALES.includes(s as AppLocale)) return s as AppLocale
  if (s === 'pt' || s.startsWith('pt_')) return 'pt-BR'
  if (s === 'en' || s.startsWith('en_')) return 'en-US'
  if (s === 'es' || s.startsWith('es_')) return 'es'
  return 'pt-BR'
}
