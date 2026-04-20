import type { AppLocale } from './i18n-config'
import clientPt from '@/locales/client/pt-BR.json'
import clientEn from '@/locales/client/en-US.json'
import clientEs from '@/locales/client/es.json'

const CLIENT: Record<AppLocale, Record<string, unknown>> = {
  'pt-BR': clientPt as Record<string, unknown>,
  'en-US': clientEn as Record<string, unknown>,
  es: clientEs as Record<string, unknown>,
}

export function getClientDictionary(locale: AppLocale): Record<string, unknown> {
  return CLIENT[locale] ?? CLIENT['pt-BR']
}

export function getNested(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined
    if (typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}
