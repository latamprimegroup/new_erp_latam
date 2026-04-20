'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, TrendingUp } from 'lucide-react'
import { useDashboardI18n } from '@/contexts/DashboardI18nContext'

type Row = {
  codename: string
  roiPercent: number | null
  nicheLabel: string
  isYou: boolean
}

export function GamificationLeaderboardTeaser() {
  const { t } = useDashboardI18n()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/cliente/gamification/leaderboard-week')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !Array.isArray(j.rows)) return
        setRows(j.rows.slice(0, 5))
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="card mb-8">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[#00FF00]" />
          {t('gamification.leaderboardTeaserTitle')}
        </h2>
        <Link
          href="/dashboard/cliente/gamificacao"
          className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
        >
          {t('gamification.leaderboardTeaserCta')}
        </Link>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{t('gamification.leaderboardTeaserHint')}</p>
      {loading ? (
        <div className="flex justify-center py-6 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">{t('gamification.leaderboardEmpty')}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((row, i) => (
            <li
              key={`${row.codename}-${i}`}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 border border-gray-200 dark:border-white/10 ${
                row.isYou ? 'bg-primary-500/10 dark:bg-primary-500/15' : ''
              }`}
            >
              <span className="font-mono text-xs text-gray-600 dark:text-gray-300">
                #{i + 1} {row.codename}
                {row.isYou ? <span className="ml-1 text-[#00FF00]">({t('gamification.you')})</span> : null}
              </span>
              <span className="text-xs text-gray-500">{row.nicheLabel}</span>
              <span className="font-mono text-emerald-600 dark:text-[#00FF00]">
                {row.roiPercent != null ? `${row.roiPercent.toFixed(1)}%` : '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
