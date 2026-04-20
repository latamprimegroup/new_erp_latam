'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, PlayCircle } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useDashboardI18n } from '@/contexts/DashboardI18nContext'

type Detail = {
  slug: string
  title: string
  productLabel: string
  nicheLabel: string
  headline: string | null
  status: string
  spend24hBrl: number | null
  spend7dBrl: number | null
  revenue24hBrl: number
  revenue7dBrl: number
  roiNet24hPercent: number | null
  roiNet7dPercent: number | null
  validatedAt: string | null
  graveyardReason: string | null
  graveyardLossBrl: number | null
  gastoTotalBrl: number | null
  cpaMedioBrl: number | null
  roiLiquidoPercent: number | null
  volumeVendas: number | null
  metricsSyncedAt: string | null
  summary: string | null
  analysisText: string | null
  cpaIdealBrl: number | null
  scaleBudgetHintBrl: number | null
  suggestedCheckoutUrl: string | null
  defaultOfferPlatform: string | null
  hasTemplate: boolean
  screenshots: Array<{ imageUrl: string; caption: string | null; capturedAt: string | null }>
  insights: Array<{ kind: string; mediaUrl: string; title: string | null }>
  skinInGame7d: Array<{ day: string; amountBrl: number }>
}

function money(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function canReplicate(status: string) {
  return status === 'VALIDADA' || status === 'EM_ESCALA'
}

export function LiveProofLabDetailClient({ slug }: { slug: string }) {
  const { t, formatDateTime } = useDashboardI18n()
  const [c, setC] = useState<Detail | null>(null)
  const [series, setSeries] = useState<{
    labels: string[]
    checkouts: number[]
    salesCount: number[]
    revenueBrl: number[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [checkoutUrl, setCheckoutUrl] = useState('')
  const [repBusy, setRepBusy] = useState(false)
  const [repMsg, setRepMsg] = useState<string | null>(null)
  const [shotIdx, setShotIdx] = useState(0)

  const load = useCallback(() => {
    setLoading(true)
    setErr(null)
    Promise.all([
      fetch(`/api/cliente/live-proof-labs/${encodeURIComponent(slug)}`).then((r) =>
        r.json().then((j) => ({ ok: r.ok, j })),
      ),
      fetch(`/api/cliente/live-proof-labs/${encodeURIComponent(slug)}/series?days=14`).then((r) =>
        r.json().then((j) => ({ ok: r.ok, j })),
      ),
    ])
      .then(([{ ok, j }, s]) => {
        if (!ok) throw new Error(j.error || 'Erro')
        setC(j.case)
        setShotIdx(0)
        setCheckoutUrl(j.case?.suggestedCheckoutUrl || '')
        if (s.ok && s.j.series) setSeries(s.j.series)
        else setSeries(null)
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Erro'))
      .finally(() => setLoading(false))
  }, [slug])

  useEffect(() => {
    load()
  }, [load])

  const chartRows = useMemo(() => {
    if (!series) return []
    return series.labels.map((name, i) => ({
      name: name.slice(5),
      Checkouts: series.checkouts[i],
      Vendas: series.salesCount[i],
      Receita: series.revenueBrl[i],
    }))
  }, [series])

  const skinRows = useMemo(() => {
    if (!c?.skinInGame7d?.length) return []
    return c.skinInGame7d.map((r) => ({
      name: r.day.slice(5),
      Gasto: r.amountBrl,
    }))
  }, [c?.skinInGame7d])

  async function replicate() {
    if (!c || !canReplicate(c.status)) return
    const url = checkoutUrl.trim()
    if (!url) {
      setRepMsg(t('liveProofLabs.checkoutRequired'))
      return
    }
    setRepBusy(true)
    setRepMsg(null)
    try {
      const r = await fetch(`/api/cliente/live-proof-labs/${encodeURIComponent(slug)}/replicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutUrl: url }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Erro')
      setRepMsg(`${t('liveProofLabs.replicateOk')} ${j.ticketNumber}. ${t('liveProofLabs.openShield')}`)
      if (j.nextSteps?.shieldTrackerUrl) {
        window.open(j.nextSteps.shieldTrackerUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (e) {
      setRepMsg(e instanceof Error ? e.message : 'Erro')
    } finally {
      setRepBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-10 h-10 animate-spin text-primary-500" />
      </div>
    )
  }
  if (err || !c) {
    return (
      <div className="max-w-3xl mx-auto">
        <Link href="/dashboard/cliente/live-proof-labs" className="text-sm text-primary-600 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> {t('liveProofLabs.back')}
        </Link>
        <p className="mt-6 text-red-600">{err || '—'}</p>
      </div>
    )
  }

  const statusLabel =
    c.status === 'EM_TESTE'
      ? t('liveProofLabs.statusEmTeste')
      : c.status === 'VALIDADA'
        ? t('liveProofLabs.statusValidada')
        : c.status === 'EM_ESCALA'
          ? t('liveProofLabs.statusEmEscala')
          : c.status === 'REPROVADA'
            ? t('liveProofLabs.statusReprovada')
            : c.status

  const hasSync =
    c.gastoTotalBrl != null ||
    c.cpaMedioBrl != null ||
    c.roiLiquidoPercent != null ||
    c.volumeVendas != null

  const shots = c.screenshots
  const shot = shots[shotIdx]

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <Link
        href="/dashboard/cliente/live-proof-labs"
        className="text-sm text-primary-600 inline-flex items-center gap-1 hover:underline"
      >
        <ArrowLeft className="w-4 h-4" /> {t('liveProofLabs.back')}
      </Link>

      <header>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs uppercase text-primary-500 font-semibold">{c.nicheLabel}</p>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-gray-200 dark:bg-white/10 text-gray-800 dark:text-gray-200">
            {statusLabel}
          </span>
        </div>
        <h1 className="heading-1 mt-1">{c.title}</h1>
        <p className="text-gray-600 dark:text-gray-300 mt-2">{c.productLabel}</p>
        {c.headline ? <p className="text-sm text-gray-500 mt-2 italic">{c.headline}</p> : null}
      </header>

      {c.summary ? (
        <div className="card text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{c.summary}</div>
      ) : null}

      {hasSync && (
        <div className="card space-y-2">
          <h2 className="font-semibold">{t('liveProofLabs.syncedMetrics')}</h2>
          {c.metricsSyncedAt ? (
            <p className="text-xs text-gray-500">
              {t('liveProofLabs.syncedAt', { ts: formatDateTime(c.metricsSyncedAt) })}
            </p>
          ) : null}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            {c.gastoTotalBrl != null ? (
              <div>
                <p className="text-gray-500 text-xs">{t('liveProofLabs.gastoTotal')}</p>
                <p className="font-semibold">{money(c.gastoTotalBrl)}</p>
              </div>
            ) : null}
            {c.cpaMedioBrl != null ? (
              <div>
                <p className="text-gray-500 text-xs">{t('liveProofLabs.cpaMedio')}</p>
                <p className="font-semibold">{money(c.cpaMedioBrl)}</p>
              </div>
            ) : null}
            {c.roiLiquidoPercent != null ? (
              <div>
                <p className="text-gray-500 text-xs">{t('liveProofLabs.roiLiquido')}</p>
                <p className="font-semibold text-primary-600">{c.roiLiquidoPercent.toFixed(2)}%</p>
              </div>
            ) : null}
            {c.volumeVendas != null ? (
              <div>
                <p className="text-gray-500 text-xs">{t('liveProofLabs.volumeVendas')}</p>
                <p className="font-semibold">{c.volumeVendas}</p>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card">
          <p className="text-xs text-gray-500">{t('liveProofLabs.spend7d')}</p>
          <p className="text-xl font-bold">{c.spend7dBrl != null ? money(c.spend7dBrl) : '—'}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">{t('liveProofLabs.rev7d')}</p>
          <p className="text-xl font-bold text-emerald-600">{money(c.revenue7dBrl)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">{t('liveProofLabs.roiNet7d')}</p>
          <p className="text-xl font-bold text-primary-600">
            {c.roiNet7dPercent != null ? `${c.roiNet7dPercent.toFixed(1)}%` : '—'}
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">{t('liveProofLabs.cpaIdeal')}</p>
          <p className="text-xl font-bold">{c.cpaIdealBrl != null ? money(c.cpaIdealBrl) : '—'}</p>
        </div>
      </div>

      {c.scaleBudgetHintBrl != null ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t('liveProofLabs.scaleHint', { amount: money(c.scaleBudgetHintBrl) })}
        </p>
      ) : null}

      {skinRows.length > 0 && (
        <div className="card h-72">
          <h2 className="font-semibold mb-2">{t('liveProofLabs.skinInGame')}</h2>
          <p className="text-xs text-gray-500 mb-3">{t('liveProofLabs.skinInGameHint')}</p>
          <ResponsiveContainer width="100%" height="75%">
            <BarChart data={skinRows}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Bar dataKey="Gasto" fill="#f59e0b" name={t('liveProofLabs.spendBar')} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {c.analysisText ? (
        <div className="card">
          <h2 className="font-semibold mb-2">{t('liveProofLabs.analysis')}</h2>
          <p className="text-sm whitespace-pre-wrap text-gray-700 dark:text-gray-200">{c.analysisText}</p>
        </div>
      ) : null}

      {c.insights.length > 0 && (
        <div className="card space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <PlayCircle className="w-5 h-5" />
            {t('liveProofLabs.media')}
          </h2>
          <ul className="space-y-2">
            {c.insights.map((m, i) => (
              <li key={i}>
                <a
                  href={m.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary-600 hover:underline text-sm"
                >
                  {m.title || (m.kind === 'VIDEO' ? 'Vídeo' : 'Áudio')} ({m.kind})
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {shots.length > 0 && shot && (
        <div className="card space-y-3">
          <h2 className="font-semibold">{t('liveProofLabs.screenshots')}</h2>
          <div className="relative rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden bg-black/5 dark:bg-white/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.imageUrl} alt={shot.caption || ''} className="w-full max-h-[420px] object-contain mx-auto" />
            <div className="flex items-center justify-between gap-2 p-3 bg-white/90 dark:bg-black/40">
              <button
                type="button"
                className="p-2 rounded-lg border border-gray-200 dark:border-white/15 disabled:opacity-40"
                disabled={shotIdx <= 0}
                onClick={() => setShotIdx((i) => Math.max(0, i - 1))}
                aria-label="Anterior"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="text-center text-xs text-gray-600 dark:text-gray-300 flex-1 min-w-0">
                <p>
                  {shotIdx + 1} / {shots.length}
                  {shot.capturedAt
                    ? ` · ${t('liveProofLabs.printAt', { ts: formatDateTime(shot.capturedAt) })}`
                    : ''}
                </p>
                {shot.caption ? <p className="mt-1 font-medium text-gray-800 dark:text-gray-100">{shot.caption}</p> : null}
              </div>
              <button
                type="button"
                className="p-2 rounded-lg border border-gray-200 dark:border-white/15 disabled:opacity-40"
                disabled={shotIdx >= shots.length - 1}
                onClick={() => setShotIdx((i) => Math.min(shots.length - 1, i + 1))}
                aria-label="Seguinte"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {chartRows.length > 0 && (
        <div className="card h-80">
          <h2 className="font-semibold mb-4">{t('liveProofLabs.chart')}</h2>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Checkouts" fill="#6366f1" />
              <Bar dataKey="Vendas" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {c.status === 'REPROVADA' && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm">
          <p className="font-semibold text-amber-900 dark:text-amber-100">{t('liveProofLabs.graveyardBadge')}</p>
          <p className="mt-2 text-amber-900/90">{c.graveyardReason}</p>
          {c.graveyardLossBrl != null ? (
            <p className="mt-2 font-medium text-red-700 dark:text-red-300">{money(c.graveyardLossBrl)}</p>
          ) : null}
        </div>
      )}

      {canReplicate(c.status) && c.hasTemplate && (
        <div className="card space-y-3 border-primary-500/30">
          <h2 className="font-semibold">{t('liveProofLabs.replicate')}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">{t('liveProofLabs.replicateHint')}</p>
          <label className="block text-xs text-gray-500">
            {t('liveProofLabs.checkoutUrl')}
            <input
              type="url"
              value={checkoutUrl}
              onChange={(e) => setCheckoutUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm"
            />
          </label>
          {c.defaultOfferPlatform ? (
            <p className="text-xs text-gray-500">
              {t('liveProofLabs.platformHint', { p: c.defaultOfferPlatform })}
            </p>
          ) : null}
          <button
            type="button"
            disabled={repBusy}
            onClick={replicate}
            className="rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
          >
            {repBusy && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('liveProofLabs.replicateBtn')}
          </button>
          {repMsg ? <p className="text-sm text-gray-600 dark:text-gray-300">{repMsg}</p> : null}
        </div>
      )}
    </div>
  )
}
