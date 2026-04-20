'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Radio } from 'lucide-react'
import { motion } from 'framer-motion'
import { useDashboardI18n } from '@/contexts/DashboardI18nContext'

type Step = { id: string; done: boolean; href: string }

type Overview = {
  checklist: {
    totalSteps: number
    consecutiveDone: number
    fraction: number
    steps: Step[]
  }
  warTeam: {
    supportOnline: boolean
    operators: { id: string; name: string }[]
  }
}

export function WarRoomOsChecklist() {
  const { t } = useDashboardI18n()
  const [data, setData] = useState<Overview | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [postWelcomeGlow, setPostWelcomeGlow] = useState(false)

  useEffect(() => {
    const onWelcomeDone = () => {
      setPostWelcomeGlow(true)
      document.getElementById('war-room-os-checklist')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      window.setTimeout(() => setPostWelcomeGlow(false), 12_000)
    }
    window.addEventListener('welcome-onboarding-complete', onWelcomeDone)
    return () => window.removeEventListener('welcome-onboarding-complete', onWelcomeDone)
  }, [])

  useEffect(() => {
    fetch('/api/cliente/war-room-os/overview')
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) throw new Error(j.error || 'Erro')
        setData(j as Overview)
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Erro'))
  }, [])

  if (err) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-200 mb-6">
        {t('warRoomOs.loadError')}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex justify-center py-10 mb-6">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }

  const { checklist, warTeam } = data
  const pct = Math.round(checklist.fraction * 100)

  return (
    <div id="war-room-os-checklist" className="space-y-6 mb-10 scroll-mt-24">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className={`rounded-2xl border bg-[#0a0a0a] dark:bg-[#0a0a0a] p-5 sm:p-6 shadow-lg shadow-black/40 transition-[box-shadow,ring] duration-500 ${
          postWelcomeGlow
            ? 'border-[#00FF00]/50 ring-2 ring-[#00FF00]/40 ring-offset-2 ring-offset-[#0a0a0a] shadow-[0_0_48px_rgba(0,255,0,0.12)]'
            : 'border-white/10'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white tracking-tight flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-[#00FF00] shadow-[0_0_12px_#00FF00]" aria-hidden />
              {t('warRoomOs.checklistTitle')}
            </h2>
            <p className="text-sm text-white/55 mt-1 max-w-xl">{t('warRoomOs.checklistSubtitle')}</p>
          </div>
          <div className="shrink-0 rounded-xl border border-white/10 bg-black/40 px-4 py-3 min-w-[200px]">
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">{t('warRoomOs.warTeamTitle')}</p>
            <div className="flex items-center gap-2">
              <span
                className={`relative flex h-2.5 w-2.5 ${warTeam.supportOnline ? '' : 'opacity-50'}`}
                aria-hidden
              >
                {warTeam.supportOnline ? (
                  <>
                    <span className="absolute inline-flex h-full w-full rounded-full bg-[#00FF00] opacity-40 animate-ping" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#00FF00]" />
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gray-500" />
                )}
              </span>
              <span className="text-sm font-medium text-white">
                {warTeam.supportOnline ? t('warRoomOs.supportOnline') : t('warRoomOs.supportOffline')}
              </span>
            </div>
            <p className="text-xs text-white/45 mt-2">
              {warTeam.operators.map((o) => o.name).join(' · ')}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex justify-between text-xs text-white/50 mb-2">
            <span>{t('warRoomOs.progressLabel')}</span>
            <span className="font-mono text-[#00FF00]/90">{pct}%</span>
          </div>
          <div className="h-3 rounded-full bg-white/5 overflow-hidden border border-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-[#00FF00]"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            />
          </div>
        </div>

        <ol className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {checklist.steps.map((step, i) => (
            <motion.li
              key={step.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.25 }}
            >
              <Link
                href={step.href}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
                  step.done
                    ? 'border-[#00FF00]/35 bg-[#00FF00]/5 text-white'
                    : 'border-white/10 bg-black/20 text-white/70 hover:border-white/20'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    step.done ? 'bg-[#00FF00] text-black' : 'bg-white/10 text-white/60'
                  }`}
                >
                  {i + 1}
                </span>
                <span className="leading-snug pt-0.5">{t(`warRoomOs.step.${step.id}`)}</span>
              </Link>
            </motion.li>
          ))}
        </ol>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-xs text-gray-500 dark:text-white/40 flex items-center gap-2"
      >
        <Radio className="w-3.5 h-3.5 shrink-0" />
        {t('warRoomOs.lexiconHint')}
      </motion.p>
    </div>
  )
}
