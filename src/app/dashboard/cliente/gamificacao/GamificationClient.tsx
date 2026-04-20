'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Crown, Gift, Loader2, Lock, RefreshCw, Sparkles, Trophy, Users, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDashboardI18n } from '@/contexts/DashboardI18nContext'

type RewardRow = {
  key: string
  titleKey: string
  descKey: string
  minNetProfitBrl: number
  unlocked: boolean
  redeemRequestedAt: string | null
  fulfilledAt: string | null
  canRedeem: boolean
}

type LbRow = { codename: string; roiPercent: number | null; nicheLabel: string; isYou: boolean }

type ShippingForm = {
  fullName: string
  phone: string
  line1: string
  line2: string
  neighborhood: string
  city: string
  stateUf: string
  postalCode: string
  country: string
}

const emptyShipping: ShippingForm = {
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  neighborhood: '',
  city: '',
  stateUf: '',
  postalCode: '',
  country: 'BR',
}

function money(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function GamificationClient() {
  const { t } = useDashboardI18n()
  const [summary, setSummary] = useState<{
    lifetime: { netProfitBrl: number }
    patent: { id: string; nextId: string | null; xpToNextFraction: number; rangeCeilingBrl: number | null }
    codename: string
  } | null>(null)
  const [rewards, setRewards] = useState<RewardRow[]>([])
  const [netForRewards, setNetForRewards] = useState(0)
  const [lbRows, setLbRows] = useState<LbRow[]>([])
  const [lbNote, setLbNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [redeemTarget, setRedeemTarget] = useState<string | null>(null)
  const [shipping, setShipping] = useState<ShippingForm>(emptyShipping)

  const load = useCallback(() => {
    setLoading(true)
    setMsg(null)
    Promise.all([
      fetch('/api/cliente/gamification/summary').then((r) => r.json()),
      fetch('/api/cliente/gamification/rewards').then((r) => r.json()),
      fetch('/api/cliente/gamification/leaderboard-week').then((r) => r.json()),
    ])
      .then(([s, rw, lb]) => {
        if (s.patent) setSummary(s)
        if (Array.isArray(rw.rewards)) {
          setRewards(rw.rewards)
          setNetForRewards(typeof rw.netProfitBrl === 'number' ? rw.netProfitBrl : 0)
        }
        if (Array.isArray(lb.rows)) setLbRows(lb.rows)
        if (typeof lb.disclaimer === 'string') setLbNote(lb.disclaimer)
      })
      .catch(() => setMsg(t('gamification.loadError')))
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  function openRedeem(key: string) {
    setRedeemTarget(key)
    setShipping(emptyShipping)
    setMsg(null)
  }

  async function submitRedeem() {
    if (!redeemTarget) return
    setBusyKey(redeemTarget)
    setMsg(null)
    try {
      const r = await fetch('/api/cliente/gamification/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewardKey: redeemTarget,
          shipping: {
            fullName: shipping.fullName.trim(),
            phone: shipping.phone.trim(),
            line1: shipping.line1.trim(),
            line2: shipping.line2.trim() || undefined,
            neighborhood: shipping.neighborhood.trim() || undefined,
            city: shipping.city.trim(),
            stateUf: shipping.stateUf.trim(),
            postalCode: shipping.postalCode.trim(),
            country: shipping.country.trim() || 'BR',
          },
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Erro')
      const parts: string[] = []
      if (j.emailConfigured && j.emailSent) parts.push(t('gamification.redeemOk'))
      else if (j.emailConfigured && !j.emailSent) parts.push(t('gamification.redeemEmailFail'))
      else parts.push(t('gamification.redeemNoEmail'))
      if (j.webhookConfigured && j.webhookSent) parts.push(t('gamification.redeemWebhookOk'))
      else if (j.webhookConfigured && !j.webhookSent) parts.push(t('gamification.redeemWebhookFail'))
      setMsg(parts.join(' '))
      setRedeemTarget(null)
      load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro')
    } finally {
      setBusyKey(null)
    }
  }

  const xpPct = summary ? Math.round(summary.patent.xpToNextFraction * 100) : 0

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-10">
      <div>
        <h1 className="heading-1 flex items-center gap-2">
          <Trophy className="w-8 h-8 text-amber-500" />
          {t('gamification.title')}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-2xl">{t('gamification.subtitle')}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-10 h-10 animate-spin text-primary-500" />
        </div>
      ) : null}

      {msg ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 text-amber-100 px-4 py-2 text-sm">{msg}</div>
      ) : null}

      {summary ? (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-5 sm:p-6 text-white"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40">{t('gamification.yourCodename')}</p>
              <p className="text-xl font-bold text-[#00FF00] font-mono">{summary.codename}</p>
              <p className="text-sm text-white/55 mt-2">
                {t('gamification.netProfitLifetime')}:{' '}
                <span className="text-white font-semibold">{money(summary.lifetime.netProfitBrl)}</span>
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-2">
                <Crown className="w-5 h-5 text-amber-400" />
                <span className="text-lg font-bold">{t(`gamification.patent.${summary.patent.id}`)}</span>
              </div>
              {summary.patent.nextId ? (
                <p className="text-xs text-white/45 mt-1">
                  {xpPct}% {t('gamification.towards')} {t(`gamification.patent.${summary.patent.nextId}`)}
                </p>
              ) : (
                <p className="text-xs text-[#00FF00] mt-1">{t('gamification.maxPatent')}</p>
              )}
            </div>
          </div>
          <div className="mt-4 h-2.5 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-[#00FF00]"
              initial={{ width: 0 }}
              animate={{ width: `${summary.patent.nextId ? xpPct : 100}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </motion.section>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-white">
            <Gift className="w-5 h-5 text-primary-500" />
            {t('gamification.arsenalTitle')}
          </h2>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-primary-500"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t('gamification.refresh')}
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('gamification.arsenalIntro')}</p>
        <p className="text-xs text-gray-400">
          {t('gamification.arsenalNetRef')}: {money(netForRewards)}
        </p>
        <ul className="grid gap-4 sm:grid-cols-2">
          {rewards.map((rw, i) => (
            <motion.li
              key={rw.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * i }}
              className={`rounded-xl border p-4 transition-all ${
                rw.unlocked
                  ? 'border-[#00FF00]/30 bg-emerald-950/10 dark:bg-emerald-950/20'
                  : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-black/20 opacity-80 grayscale'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {rw.unlocked ? (
                    <Sparkles className="w-5 h-5 text-[#00FF00] shrink-0" />
                  ) : (
                    <Lock className="w-5 h-5 text-gray-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">
                      {t(`gamification.rewards.${rw.titleKey}`)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {t(`gamification.rewards.${rw.descKey}`)}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-2">
                      {t('gamification.threshold')}: {money(rw.minNetProfitBrl)}
                    </p>
                  </div>
                </div>
              </div>
              {rw.unlocked && rw.canRedeem ? (
                <button
                  type="button"
                  disabled={busyKey === rw.key}
                  onClick={() => openRedeem(rw.key)}
                  className="mt-3 w-full rounded-lg bg-[#00FF00] text-black text-sm font-semibold py-2 hover:bg-[#33ff33] disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {busyKey === rw.key ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {t('gamification.redeemCta')}
                </button>
              ) : null}
              {rw.redeemRequestedAt && !rw.fulfilledAt ? (
                <p className="mt-3 text-xs text-amber-600 dark:text-amber-300">{t('gamification.redeemPending')}</p>
              ) : null}
              {rw.fulfilledAt ? (
                <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">{t('gamification.redeemFulfilled')}</p>
              ) : null}
            </motion.li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-white">
          <Users className="w-5 h-5 text-primary-500" />
          {t('gamification.leaderboardTitle')}
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">{lbNote}</p>
        <div className="rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-white/5 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">{t('gamification.lbCodename')}</th>
                <th className="p-3">{t('gamification.lbNiche')}</th>
                <th className="p-3 text-right">{t('gamification.lbRoi')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/10">
              {lbRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-gray-500">
                    {t('gamification.leaderboardEmpty')}
                  </td>
                </tr>
              ) : (
                lbRows.map((row, idx) => (
                  <tr
                    key={`${row.codename}-${idx}`}
                    className={row.isYou ? 'bg-primary-500/10 dark:bg-primary-500/15' : ''}
                  >
                    <td className="p-3 font-mono text-xs">{idx + 1}</td>
                    <td className="p-3 font-medium font-mono text-xs">
                      {row.codename}
                      {row.isYou ? (
                        <span className="ml-2 text-[10px] text-[#00FF00]">({t('gamification.you')})</span>
                      ) : null}
                    </td>
                    <td className="p-3 text-xs text-gray-600 dark:text-gray-300">{row.nicheLabel}</td>
                    <td className="p-3 text-right font-mono">
                      {row.roiPercent != null ? `${row.roiPercent.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-center">
        <Link href="/dashboard/cliente/profit-board" className="text-sm text-primary-600 dark:text-primary-400 underline">
          {t('gamification.linkProfitBoard')}
        </Link>
      </p>

      <AnimatePresence>
        {redeemTarget ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setRedeemTarget(null)}
          >
            <motion.div
              className="relative w-full max-w-md rounded-2xl border border-white/15 bg-gray-900 text-white p-6 shadow-xl"
              initial={{ scale: 0.94, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="absolute top-3 right-3 p-2 rounded-lg text-gray-400 hover:bg-white/10"
                onClick={() => setRedeemTarget(null)}
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
              <h3 className="text-lg font-semibold pr-8">{t('gamification.shippingModalTitle')}</h3>
              <p className="text-xs text-gray-400 mt-1 mb-4">{t('gamification.shippingModalHint')}</p>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                <label className="block text-xs text-gray-400">
                  {t('gamification.shippingName')}
                  <input
                    className="mt-1 w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm"
                    value={shipping.fullName}
                    onChange={(e) => setShipping((s) => ({ ...s, fullName: e.target.value }))}
                  />
                </label>
                <label className="block text-xs text-gray-400">
                  {t('gamification.shippingPhone')}
                  <input
                    className="mt-1 w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm"
                    value={shipping.phone}
                    onChange={(e) => setShipping((s) => ({ ...s, phone: e.target.value }))}
                  />
                </label>
                <label className="block text-xs text-gray-400">
                  {t('gamification.shippingLine1')}
                  <input
                    className="mt-1 w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm"
                    value={shipping.line1}
                    onChange={(e) => setShipping((s) => ({ ...s, line1: e.target.value }))}
                  />
                </label>
                <label className="block text-xs text-gray-400">
                  {t('gamification.shippingLine2')}
                  <input
                    className="mt-1 w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm"
                    value={shipping.line2}
                    onChange={(e) => setShipping((s) => ({ ...s, line2: e.target.value }))}
                  />
                </label>
                <label className="block text-xs text-gray-400">
                  {t('gamification.shippingNeighborhood')}
                  <input
                    className="mt-1 w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm"
                    value={shipping.neighborhood}
                    onChange={(e) => setShipping((s) => ({ ...s, neighborhood: e.target.value }))}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs text-gray-400">
                    {t('gamification.shippingCity')}
                    <input
                      className="mt-1 w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm"
                      value={shipping.city}
                      onChange={(e) => setShipping((s) => ({ ...s, city: e.target.value }))}
                    />
                  </label>
                  <label className="block text-xs text-gray-400">
                    {t('gamification.shippingState')}
                    <input
                      className="mt-1 w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm"
                      value={shipping.stateUf}
                      onChange={(e) => setShipping((s) => ({ ...s, stateUf: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs text-gray-400">
                    {t('gamification.shippingPostal')}
                    <input
                      className="mt-1 w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm"
                      value={shipping.postalCode}
                      onChange={(e) => setShipping((s) => ({ ...s, postalCode: e.target.value }))}
                    />
                  </label>
                  <label className="block text-xs text-gray-400">
                    {t('gamification.shippingCountry')}
                    <input
                      className="mt-1 w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm"
                      value={shipping.country}
                      onChange={(e) => setShipping((s) => ({ ...s, country: e.target.value }))}
                    />
                  </label>
                </div>
              </div>
              <button
                type="button"
                disabled={busyKey === redeemTarget}
                onClick={() => void submitRedeem()}
                className="mt-5 w-full rounded-lg bg-[#00FF00] text-black font-semibold py-2.5 hover:bg-[#33ff33] disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {busyKey === redeemTarget ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {t('gamification.shippingSubmit')}
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
