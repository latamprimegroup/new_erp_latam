'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Medal } from 'lucide-react'
import { useDashboardI18n } from '@/contexts/DashboardI18nContext'

type BadgeVariant = 'recruit' | 'silver' | 'command' | 'gold' | 'chaos'

type Summary = {
  patent: { id: string; nextId: string | null; xpToNextFraction: number }
  codename: string
  badgeVariant?: BadgeVariant
}

const BADGE_RING: Record<BadgeVariant, string> = {
  recruit: 'border-white/25 bg-white/5 text-gray-200',
  silver: 'border-slate-300/80 bg-gradient-to-br from-slate-600/40 to-slate-900/60 text-slate-100 shadow-[0_0_12px_rgba(148,163,184,0.35)]',
  command: 'border-sky-500/60 bg-sky-950/40 text-sky-100 shadow-[0_0_14px_rgba(14,165,233,0.25)]',
  gold: 'border-amber-400/90 bg-gradient-to-br from-amber-700/35 to-yellow-900/50 text-amber-50 shadow-[0_0_16px_rgba(251,191,36,0.35)]',
  chaos: 'border-fuchsia-500/80 bg-gradient-to-br from-fuchsia-900/50 to-violet-950/60 text-fuchsia-100 shadow-[0_0_20px_rgba(217,70,239,0.35)]',
}

export function ClientHeaderGamification() {
  const { t } = useDashboardI18n()
  const [data, setData] = useState<Summary | null>(null)

  useEffect(() => {
    fetch('/api/cliente/gamification/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.patent) {
          setData({
            patent: j.patent,
            codename: j.codename ?? '',
            badgeVariant: j.badgeVariant ?? 'recruit',
          })
        }
      })
      .catch(() => {})
  }, [])

  if (!data) {
    return (
      <div className="hidden sm:flex items-center gap-2 text-gray-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      </div>
    )
  }

  const pct = Math.round(data.patent.xpToNextFraction * 100)
  const variant: BadgeVariant = data.badgeVariant ?? 'recruit'

  return (
    <Link
      href="/dashboard/cliente/gamificacao"
      className="hidden sm:flex flex-col items-end min-w-0 max-w-[220px] lg:max-w-[260px] group"
      title={t('gamification.headerHint')}
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-800 dark:text-white truncate w-full justify-end">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 shrink-0 ${BADGE_RING[variant]}`}
        >
          <Medal className="w-3 h-3 shrink-0 opacity-90" />
          <span className="truncate max-w-[120px]">{t(`gamification.patent.${data.patent.id}`)}</span>
        </span>
      </div>
      <div className="flex items-center gap-2 w-full mt-0.5">
        <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-[#00FF00] transition-all duration-500"
            style={{ width: `${data.patent.nextId ? pct : 100}%` }}
          />
        </div>
        <span className="text-[9px] text-gray-500 dark:text-white/45 shrink-0 font-mono">{data.codename}</span>
      </div>
    </Link>
  )
}
