'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { APP_LOCALES, LOCALE_LABELS, type AppLocale } from '@/lib/i18n-config'
import { useDashboardI18n } from '@/contexts/DashboardI18nContext'

export function LanguageSwitcher() {
  const { locale, setLocale, isClientRole } = useDashboardI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  if (!isClientRole) return null

  const current = LOCALE_LABELS[locale]

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/15 px-2 py-1.5 text-xs text-gray-700 dark:text-white/85 hover:bg-gray-100 dark:hover:bg-white/10 max-w-[140px]"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="text-base leading-none" aria-hidden>
          {current.flag}
        </span>
        <span className="truncate hidden sm:inline">{current.name}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>
      {open ? (
        <ul
          className="absolute right-0 mt-1 z-50 min-w-[160px] rounded-lg border border-gray-200 dark:border-white/15 bg-white dark:bg-ads-navy shadow-lg py-1"
          role="listbox"
        >
          {APP_LOCALES.map((code) => {
            const L = LOCALE_LABELS[code]
            return (
              <li key={code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={locale === code}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-white/10 ${
                    locale === code ? 'text-primary-600 dark:text-primary-400 font-medium' : 'text-gray-800 dark:text-white/90'
                  }`}
                  onClick={() => {
                    void setLocale(code as AppLocale)
                    setOpen(false)
                  }}
                >
                  <span aria-hidden>{L.flag}</span>
                  {L.name}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
