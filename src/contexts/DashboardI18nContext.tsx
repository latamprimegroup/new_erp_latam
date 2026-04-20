'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useSession } from 'next-auth/react'
import {
  LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  type AppLocale,
} from '@/lib/i18n-config'
import { getClientDictionary, getNested, interpolate } from '@/lib/i18n-dictionaries'
import { formatCurrencyAmount, formatDateShort, formatDateTime } from '@/lib/locale-format'

export type DashboardI18nContextValue = {
  locale: AppLocale
  setLocale: (l: AppLocale) => Promise<void>
  t: (key: string, vars?: Record<string, string | number>) => string
  formatDate: (d: Date | string) => string
  formatDateTime: (d: Date | string) => string
  formatMoney: (amount: number, currency: 'BRL' | 'USD' | 'EUR') => string
  isClientRole: boolean
}

const DashboardI18nContext = createContext<DashboardI18nContextValue | null>(null)

export function DashboardI18nProvider({
  children,
  initialLocale,
  userRole,
}: {
  children: React.ReactNode
  initialLocale: string
  userRole: string
}) {
  const isClientRole = userRole === 'CLIENT'
  const { update } = useSession()

  const [locale, setLocaleState] = useState<AppLocale>(() =>
    isClientRole ? normalizeLocale(initialLocale) : 'pt-BR'
  )

  useEffect(() => {
    if (!isClientRole || typeof window === 'undefined') return
    const fromStorage = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (fromStorage) {
      const n = normalizeLocale(fromStorage)
      setLocaleState(n)
    }
  }, [isClientRole])

  const setLocale = useCallback(
    async (next: AppLocale) => {
      if (!isClientRole) return
      setLocaleState(next)
      localStorage.setItem(LOCALE_STORAGE_KEY, next)
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`
      try {
        await fetch('/api/user/language', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ languageCode: next }),
        })
        await update({ languageCode: next })
      } catch {
        /* rede / sessão */
      }
    },
    [isClientRole, update]
  )

  const dict = useMemo(() => getClientDictionary(locale), [locale])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = getNested(dict, key) ?? getNested(getClientDictionary('pt-BR'), key)
      if (typeof raw === 'string') return interpolate(raw, vars)
      return key
    },
    [dict]
  )

  const formatDate = useCallback((d: Date | string) => formatDateShort(d, locale), [locale])

  const formatDateTimeCb = useCallback((d: Date | string) => formatDateTime(d, locale), [locale])

  const formatMoney = useCallback(
    (amount: number, currency: 'BRL' | 'USD' | 'EUR') =>
      formatCurrencyAmount(amount, currency, locale),
    [locale]
  )

  const value = useMemo(
    (): DashboardI18nContextValue => ({
      locale,
      setLocale,
      t,
      formatDate,
      formatDateTime: formatDateTimeCb,
      formatMoney,
      isClientRole,
    }),
    [locale, setLocale, t, formatDate, formatDateTimeCb, formatMoney, isClientRole]
  )

  return (
    <DashboardI18nContext.Provider value={value}>{children}</DashboardI18nContext.Provider>
  )
}

export function useDashboardI18n(): DashboardI18nContextValue {
  const ctx = useContext(DashboardI18nContext)
  if (!ctx) {
    throw new Error('useDashboardI18n must be used within DashboardI18nProvider')
  }
  return ctx
}

/** Para componentes que podem existir fora do provider (fallback null). */
export function useOptionalDashboardI18n(): DashboardI18nContextValue | null {
  return useContext(DashboardI18nContext)
}
