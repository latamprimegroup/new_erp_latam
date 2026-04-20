'use client'

import { useMemo } from 'react'
import faqPt from '@/locales/faq/pt-BR.json'
import faqEn from '@/locales/faq/en-US.json'
import faqEs from '@/locales/faq/es.json'
import type { AppLocale } from '@/lib/i18n-config'
import { useDashboardI18n } from '@/contexts/DashboardI18nContext'

type FaqItem = { id: string; title: string; body: string }

const FAQ_BY_LOCALE: Record<AppLocale, FaqItem[]> = {
  'pt-BR': faqPt as FaqItem[],
  'en-US': faqEn as FaqItem[],
  es: faqEs as FaqItem[],
}

/**
 * FAQ filtrado pelo idioma ativo (apenas artigos do ficheiro desse locale).
 */
export function ClientKnowledgeFaq() {
  const { locale, t } = useDashboardI18n()
  const items = useMemo(() => FAQ_BY_LOCALE[locale] ?? FAQ_BY_LOCALE['pt-BR'], [locale])

  if (!items.length) return null

  return (
    <section className="card mt-8">
      <h2 className="font-semibold text-lg mb-1">{t('faq.title')}</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('faq.subtitle')}</p>
      <ul className="space-y-4 text-sm">
        {items.map((item) => (
          <li key={item.id} className="border-b border-gray-100 dark:border-white/10 pb-4 last:border-0 last:pb-0">
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">{item.title}</h3>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
