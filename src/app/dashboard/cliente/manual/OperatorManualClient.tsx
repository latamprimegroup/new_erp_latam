'use client'

import Link from 'next/link'
import { BookOpen, ExternalLink, FlaskConical, LineChart, Radio, Shield, Wrench } from 'lucide-react'
import { useDashboardI18n } from '@/contexts/DashboardI18nContext'

const pdfUrl = (process.env.NEXT_PUBLIC_OPERATOR_MANUAL_PDF_URL || '').trim()

export function OperatorManualClient() {
  const { t } = useDashboardI18n()

  const links = [
    { href: '/dashboard/cliente/ads-war-room', icon: Radio, labelKey: 'operatorManual.linkWarRoom' as const },
    { href: '/dashboard/cliente/armory', icon: Wrench, labelKey: 'operatorManual.linkArmory' as const },
    { href: '/dashboard/cliente/live-proof-labs', icon: FlaskConical, labelKey: 'operatorManual.linkLpl' as const },
    { href: '/dashboard/cliente/shield-tracker', icon: Shield, labelKey: 'operatorManual.linkShield' as const },
    { href: '/dashboard/cliente/profit-board', icon: LineChart, labelKey: 'operatorManual.linkProfit' as const },
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="heading-1 flex items-center gap-2">
          <BookOpen className="w-8 h-8 text-primary-500" />
          {t('operatorManual.title')}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{t('operatorManual.subtitle')}</p>
      </div>

      {pdfUrl ? (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
          className="card flex items-center justify-between gap-4 border-primary-500/30 hover:border-primary-500/50 transition-colors"
        >
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">{t('operatorManual.pdfTitle')}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('operatorManual.pdfHint')}</p>
          </div>
          <ExternalLink className="w-5 h-5 text-primary-500 shrink-0" />
        </a>
      ) : null}

      <div className="card space-y-3">
        <h2 className="font-semibold text-gray-900 dark:text-white">{t('operatorManual.quickLinks')}</h2>
        <ul className="space-y-2">
          {links.map(({ href, icon: Icon, labelKey }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-white/10 px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                <Icon className="w-4 h-4 text-primary-500 shrink-0" />
                {t(labelKey)}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
