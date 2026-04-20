'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  Download,
  LineChart,
  Loader2,
  RefreshCw,
  Scale,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useDashboardI18n } from '@/contexts/DashboardI18nContext'

type Overview = {
  period: { from: string; to: string }
  deductionPercent: number
  dataSources: { spend: string; revenue: string; note: string }
  offersLinked: number
  totals: {
    adSpend: number
    grossRevenueTracker: number
    netRevenueTracker: number
    netProfit: number
    roiRealPercent: number | null
    currency: string
  }
  creativeVault: { spend: number; salesReported: number; roiPercent: number | null }
  uniHealth24h: {
    allowed: number
    blocked: number
    blockedRatio: number
    maxRecommendedDailyBudgetIncreasePercent: number
  }
  scalePredictorHint: { message: string; riskFlagBudgetCapPercent: number }
  ltv: {
    rows: Array<{
      buyerHint: string
      purchaseCount: number
      totalGross: number
      currency: string
      attributedCampaignId: string | null
      attributedOfferId: string | null
      firstPurchaseAt: string
      lastPurchaseAt: string
    }>
  }
  campaignsTop: Array<{ id: string; name: string; clickTotal: number; gclidCaptured: number; uniId: string }>
  bleeding: {
    active: boolean
    windowDays: number
    spendCreative7d: number
    checkoutRedirects302: number
    minSpendThreshold: number
  }
  benchmark: {
    nicheKey: string
    peerAvgCreativeRoiPercent: number | null
    yourCreativeRoiPercent: number | null
    sampleSize: number
    deltaVsPeerPercent: number | null
    disclaimer: string
  }
  biSnapshot: {
    referenceDate: string
    revenueTotal: number
    costTotal: number
    marginTotal: number
    ltvReal: number
  } | null
  bleedingNotify: { inAppSent: boolean; telegramOk: boolean; telegramSkipped: boolean } | null
}

type ScaleSim = {
  safeMaxTodayPercent: number
  hardCapPercent: number
  proposedIncreasePercent: number
  appliedIncreasePercent: number
  proposedBudgetUnchecked: number
  recommendedNextDailyBudget: number
  warnings: string[]
  narrative: string
  uniHealth24h: { allowed: number; blocked: number; blockedRatio: number }
}

function money(n: number, ccy: string) {
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ccy}`
}

export function ProfitBoardClient() {
  const { t } = useDashboardI18n()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [deductionPct, setDeductionPct] = useState('')

  const [budget, setBudget] = useState('500')
  const [incPct, setIncPct] = useState('15')
  const [scaleBusy, setScaleBusy] = useState(false)
  const [scaleResult, setScaleResult] = useState<ScaleSim | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const q = new URLSearchParams()
      if (from) q.set('from', from)
      if (to) q.set('to', to)
      if (deductionPct !== '') q.set('deductionPct', deductionPct)
      const r = await fetch(`/api/cliente/profit-board/overview?${q.toString()}`)
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Erro ao carregar')
      setOverview(j as Overview)
      if (!from && !to && j.period) {
        setFrom(j.period.from)
        setTo(j.period.to)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }, [from, to, deductionPct])

  useEffect(() => {
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- carga inicial; filtros aplicam com botão

  async function runScaleSim() {
    setScaleBusy(true)
    setScaleResult(null)
    try {
      const roi = overview?.totals.roiRealPercent ?? null
      const r = await fetch('/api/cliente/profit-board/scale-sim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentDailyBudget: Number(budget.replace(',', '.')) || 0,
          proposedIncreasePercent: Number(incPct.replace(',', '.')) || 0,
          roiRealPercent: roi,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Erro')
      setScaleResult(j as ScaleSim)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro')
    } finally {
      setScaleBusy(false)
    }
  }

  const monthDefault = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const [dreMonth, setDreMonth] = useState(monthDefault)

  function dreHref() {
    const q = new URLSearchParams({ month: dreMonth })
    if (deductionPct !== '') q.set('deductionPct', deductionPct)
    return `/api/cliente/profit-board/dre?${q.toString()}`
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="heading-1 flex items-center gap-2">
            <LineChart className="w-8 h-8 text-primary-500" />
            {t('profitBoard.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">{t('profitBoard.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/cliente/shield-tracker"
            className="text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-white/15 hover:bg-gray-50 dark:hover:bg-white/5"
          >
            Shield &amp; Tracker
          </Link>
          <Link
            href="/dashboard/cliente/creative-vault"
            className="text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-white/15 hover:bg-gray-50 dark:hover:bg-white/5"
          >
            Creative Vault
          </Link>
        </div>
      </div>

      <div className="card space-y-3">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('profitBoard.filters')}</p>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs space-y-1">
            <span className="text-gray-500">{t('profitBoard.from')}</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="block rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-gray-500">{t('profitBoard.to')}</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="block rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-gray-500">{t('profitBoard.deduction')}</span>
            <input
              type="number"
              min={0}
              max={99}
              step={0.1}
              placeholder="0"
              value={deductionPct}
              onChange={(e) => setDeductionPct(e.target.value)}
              className="block w-28 rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {t('profitBoard.apply')}
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 px-4 py-3 text-sm">
          {err}
        </div>
      )}

      {loading && !overview ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-10 h-10 animate-spin text-primary-500" />
        </div>
      ) : null}

      {overview && (
        <>
          {overview.bleeding.active && (
            <div className="rounded-xl border border-amber-400/60 bg-amber-50 dark:bg-amber-950/25 px-4 py-3 flex gap-3 items-start">
              <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900 dark:text-amber-100">{t('profitBoard.bleedingTitle')}</p>
                <p className="text-sm text-amber-900/90 dark:text-amber-100/90 mt-1">
                  {t('profitBoard.bleedingBody', {
                    spend: overview.bleeding.spendCreative7d.toFixed(2),
                    checkouts: String(overview.bleeding.checkoutRedirects302),
                  })}
                </p>
              </div>
            </div>
          )}

          {overview.offersLinked === 0 && (
            <div className="rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-950/20 px-4 py-3 text-sm">
              {t('profitBoard.noOffers')}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{t('profitBoard.adSpend')}</p>
              <p className="text-2xl font-bold mt-1">{money(overview.totals.adSpend, overview.totals.currency)}</p>
              <p className="text-xs text-gray-500 mt-2">{t('profitBoard.sourceCreativeVault')}</p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{t('profitBoard.grossRevenue')}</p>
              <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                {money(overview.totals.grossRevenueTracker, overview.totals.currency)}
              </p>
              <p className="text-xs text-gray-500 mt-2">{t('profitBoard.sourceTracker')}</p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{t('profitBoard.netProfit')}</p>
              <p
                className={`text-2xl font-bold mt-1 flex items-center gap-2 ${
                  overview.totals.netProfit >= 0 ? 'text-green-600' : 'text-red-500'
                }`}
              >
                {overview.totals.netProfit >= 0 ? (
                  <TrendingUp className="w-6 h-6" />
                ) : (
                  <TrendingDown className="w-6 h-6" />
                )}
                {money(overview.totals.netProfit, overview.totals.currency)}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                {t('profitBoard.afterDeduction', { pct: String(overview.deductionPercent) })}
              </p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{t('profitBoard.roiReal')}</p>
              <p className="text-2xl font-bold mt-1">
                {overview.totals.roiRealPercent != null ? `${overview.totals.roiRealPercent.toFixed(1)}%` : '—'}
              </p>
              <p className="text-xs text-gray-500 mt-2">{t('profitBoard.roiRealHint')}</p>
            </div>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 -mt-4">{overview.dataSources.note}</p>

          {overview.benchmark.peerAvgCreativeRoiPercent != null && overview.benchmark.deltaVsPeerPercent != null && (
            <div className="card border-primary-200/40 dark:border-primary-800/40">
              <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Scale className="w-5 h-5 text-primary-500" />
                {t('profitBoard.benchmarkTitle')}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                {overview.benchmark.deltaVsPeerPercent >= 0
                  ? t('profitBoard.benchmarkAbove', {
                      delta: overview.benchmark.deltaVsPeerPercent.toFixed(1),
                      niche: overview.benchmark.nicheKey,
                      n: String(overview.benchmark.sampleSize),
                    })
                  : t('profitBoard.benchmarkBelow', {
                      delta: Math.abs(overview.benchmark.deltaVsPeerPercent).toFixed(1),
                      niche: overview.benchmark.nicheKey,
                      n: String(overview.benchmark.sampleSize),
                    })}
              </p>
              <p className="text-xs text-gray-500 mt-3">{overview.benchmark.disclaimer}</p>
            </div>
          )}

          <div className="card space-y-3">
            <h2 className="font-semibold text-lg">{t('profitBoard.scaleTitle')}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">{overview.scalePredictorHint.message}</p>
            <p className="text-xs text-gray-500">
              {t('profitBoard.uniCap', {
                pct: String(overview.uniHealth24h.maxRecommendedDailyBudgetIncreasePercent),
              })}
            </p>
            <div className="flex flex-wrap gap-3 items-end pt-2 border-t border-gray-200 dark:border-white/10">
              <label className="text-xs space-y-1">
                <span className="text-gray-500">{t('profitBoard.dailyBudget')}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="block w-32 rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs space-y-1">
                <span className="text-gray-500">{t('profitBoard.increasePct')}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={incPct}
                  onChange={(e) => setIncPct(e.target.value)}
                  className="block w-24 rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={runScaleSim}
                disabled={scaleBusy}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {scaleBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
                {t('profitBoard.simulate')}
              </button>
            </div>
            {scaleResult && (
              <div className="rounded-lg bg-gray-50 dark:bg-white/5 p-4 text-sm space-y-2">
                <p>{scaleResult.narrative}</p>
                {scaleResult.warnings.length > 0 && (
                  <ul className="list-disc pl-5 text-amber-800 dark:text-amber-200 space-y-1">
                    {scaleResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-gray-500">
                  {t('profitBoard.scaleCapped', {
                    rec: scaleResult.recommendedNextDailyBudget.toFixed(2),
                    applied: String(scaleResult.appliedIncreasePercent),
                  })}
                </p>
              </div>
            )}
          </div>

          <div className="card space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="font-semibold text-lg">{t('profitBoard.dreTitle')}</h2>
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  type="month"
                  value={dreMonth}
                  onChange={(e) => setDreMonth(e.target.value)}
                  className="rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm"
                />
                <a
                  href={dreHref()}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium"
                >
                  <Download className="w-4 h-4" />
                  {t('profitBoard.dreDownload')}
                </a>
              </div>
            </div>
            <p className="text-xs text-gray-500">{t('profitBoard.dreHint')}</p>
          </div>

          <div className="card space-y-3">
            <h2 className="font-semibold text-lg">{t('profitBoard.ltvTitle')}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">{t('profitBoard.ltvHint')}</p>
            {overview.ltv.rows.length === 0 ? (
              <p className="text-sm text-gray-500">{t('profitBoard.ltvEmpty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-white/10">
                      <th className="py-2 pr-3">{t('profitBoard.ltvBuyer')}</th>
                      <th className="py-2 pr-3">{t('profitBoard.ltvPurchases')}</th>
                      <th className="py-2 pr-3">{t('profitBoard.ltvGross')}</th>
                      <th className="py-2 pr-3">{t('profitBoard.ltvCampaign')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.ltv.rows.map((r, i) => (
                      <tr key={i} className="border-b border-gray-100 dark:border-white/5">
                        <td className="py-2 pr-3 font-mono text-xs">{r.buyerHint}</td>
                        <td className="py-2 pr-3">{r.purchaseCount}</td>
                        <td className="py-2 pr-3">{money(r.totalGross, r.currency)}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{r.attributedCampaignId || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {overview.campaignsTop.length > 0 && (
            <div className="card space-y-3">
              <h2 className="font-semibold text-lg">{t('profitBoard.campaignsTitle')}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300">{t('profitBoard.campaignsHint')}</p>
              <ul className="text-sm space-y-2">
                {overview.campaignsTop.map((c) => (
                  <li key={c.id} className="flex flex-wrap justify-between gap-2 border-b border-gray-100 dark:border-white/5 pb-2">
                    <span className="font-medium truncate max-w-[min(100%,280px)]">{c.name}</span>
                    <span className="text-gray-500">
                      {c.clickTotal} clicks · gclid {c.gclidCaptured}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {overview.biSnapshot && (
            <div className="card space-y-1 text-sm text-gray-600 dark:text-gray-300">
              <p className="font-semibold text-gray-900 dark:text-white">{t('profitBoard.biSnapshot')}</p>
              <p>
                Ref. {new Date(overview.biSnapshot.referenceDate).toLocaleDateString('pt-BR')} · receita{' '}
                {money(overview.biSnapshot.revenueTotal, 'BRL')} · custo {money(overview.biSnapshot.costTotal, 'BRL')} ·
                margem {money(overview.biSnapshot.marginTotal, 'BRL')} · LTV real {money(overview.biSnapshot.ltvReal, 'BRL')}
              </p>
            </div>
          )}

          <p className="text-xs text-gray-500 dark:text-gray-400">{t('profitBoard.telegramNote')}</p>
        </>
      )}
    </div>
  )
}
