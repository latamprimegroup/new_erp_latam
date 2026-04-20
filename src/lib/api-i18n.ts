import { NextRequest, NextResponse } from 'next/server'
import type { AppLocale } from './i18n-config'
import { normalizeLocale, LOCALE_COOKIE } from './i18n-config'
import { getClientDictionary, getNested, interpolate } from './i18n-dictionaries'

/**
 * Locale para APIs: cookie NEXT_LOCALE ou cabeçalho x-locale (definido pelo cliente).
 */
export function getLocaleFromRequest(req: NextRequest): AppLocale {
  const header = req.headers.get('x-locale')
  const cookie = req.cookies.get(LOCALE_COOKIE)?.value
  return normalizeLocale(header || cookie || 'pt-BR')
}

export function translateApiError(locale: AppLocale, errorKey: keyof ApiErrorKeys | string): string {
  const path = `errors.${String(errorKey)}`
  const dict = getClientDictionary(locale)
  const raw = getNested(dict, path)
  if (typeof raw === 'string') return raw
  const fallback = getNested(getClientDictionary('pt-BR'), path)
  return typeof fallback === 'string' ? fallback : String(errorKey)
}

type ApiErrorKeys = 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'PROFILE_NOT_FOUND' | 'GENERIC'

export function apiErrorJson(
  locale: AppLocale,
  errorKey: ApiErrorKeys,
  status: number
) {
  return NextResponse.json(
    {
      error: translateApiError(locale, errorKey),
      errorKey,
    },
    { status }
  )
}

/** Mensagem genérica com interpolação opcional (chaves em client JSON) */
export function tServer(locale: AppLocale, path: string, vars?: Record<string, string | number>): string {
  const dict = getClientDictionary(locale)
  const raw = getNested(dict, path)
  if (typeof raw !== 'string') {
    const fb = getNested(getClientDictionary('pt-BR'), path)
    return typeof fb === 'string' ? interpolate(fb, vars) : path
  }
  return interpolate(raw, vars)
}
