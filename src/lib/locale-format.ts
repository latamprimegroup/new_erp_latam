import type { AppLocale } from './i18n-config'

function intlLocale(locale: AppLocale): string {
  if (locale === 'es') return 'es'
  return locale
}

/** Data curta: DD/MM/YYYY (pt) ou MM/DD/YYYY (en-US) conforme locale */
export function formatDateShort(date: Date | string, locale: AppLocale): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

/** Data e hora curtas para métricas sincronizadas / timestamps de print */
export function formatDateTime(date: Date | string, locale: AppLocale): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d)
}

/** Moeda: BRL com R$ ou USD com $ — ajusta separadores via Intl */
export function formatCurrencyAmount(
  amount: number,
  currency: 'BRL' | 'USD' | 'EUR',
  locale: AppLocale
): string {
  const map: Record<string, string> = { BRL: 'pt-BR', USD: 'en-US', EUR: 'de-DE' }
  const intl = currency === 'BRL' ? 'pt-BR' : locale === 'en-US' ? 'en-US' : locale === 'es' ? 'es' : map[currency] || 'en-US'
  return new Intl.NumberFormat(intl, { style: 'currency', currency }).format(amount)
}
