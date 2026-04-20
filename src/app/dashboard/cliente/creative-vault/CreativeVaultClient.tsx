'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  Clapperboard,
  Film,
  LayoutGrid,
  LineChart,
  Loader2,
  Plus,
  Sparkles,
} from 'lucide-react'

type Template = {
  id: string
  slug: string
  niche: string
  title: string
  description: string | null
  previewVideoUrl: string
  thumbnailUrl: string | null
  roiLabel: string
  scriptCopy: string | null
  /** Desbloqueado via Live Proof Labs — “Copiar operação” */
  liveProofUnlocked?: boolean
}

type Job = {
  id: string
  status: string
  checkoutUrl: string
  logoUrl: string | null
  hookNotes: string | null
  iterationNumber: number
  parentJobId: string | null
  iterationRootId: string | null
  deliverableUrl: string | null
  uniqueMetadataHashDone: boolean
  ctrSnapshotAtDelivery: number | null
  createdAt: string
  template: { id: string; title: string; niche: string }
}

type MetricRow = {
  id: string
  metricDate: string
  spend: number
  clicks: number
  ctrPercent: number
  cpc: number
  sales: number
  label: string | null
  jobId: string | null
  jobLabel: string | null
  roi: number | null
  diagnostics: { kind: string; message: string }[]
}

type Overview = {
  templates: Template[]
  jobs: Job[]
  metrics: MetricRow[]
  latestDiagnostics: { kind: string; message: string }[]
  iterationChains: {
    rootId: string
    jobs: {
      id: string
      iterationNumber: number
      status: string
      templateTitle: string
      ctrSnapshotAtDelivery: number | null
      uniqueMetadataHashDone: boolean
      deliverableUrl: string | null
      createdAt: string
    }[]
  }[]
  vslWatches: {
    id: string
    vslUrl: string
    dropOffSeconds: number | null
    notes: string | null
    createdAt: string
    updatedAt: string
  }[]
  deliveredJobsForSelect: { id: string; label: string }[]
  nicheOptions: string[]
}

const TAB = ['gallery', 'metrics', 'editions', 'vsl'] as const
type TabId = (typeof TAB)[number]

const NICHE_PT: Record<string, string> = {
  SAUDE: 'Saúde',
  FINANCEIRO: 'Financeiro',
  BLACK: 'Black',
  ECOMMERCE: 'E-commerce',
  IGAMING: 'iGaming',
  EDUCACAO: 'Educação',
  GERAL: 'Geral',
}

const STATUS_K_PT: Record<string, string> = {
  FILA: 'Fila',
  PRODUCAO: 'Em produção',
  REVISAO: 'Revisão',
  ENTREGUE: 'Entregue',
}

const KANBAN_ORDER = ['FILA', 'PRODUCAO', 'REVISAO', 'ENTREGUE'] as const

function templateStubFromJob(j: Job): Template {
  return {
    id: j.template.id,
    slug: '',
    niche: j.template.niche,
    title: j.template.title,
    description: null,
    previewVideoUrl: '',
    thumbnailUrl: null,
    roiLabel: '',
    scriptCopy: null,
  }
}

export function CreativeVaultClient() {
  const [tab, setTab] = useState<TabId>('gallery')
  const [nicheFilter, setNicheFilter] = useState<string>('ALL')
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [scriptModal, setScriptModal] = useState<Template | null>(null)
  const [requestTpl, setRequestTpl] = useState<Template | null>(null)
  const [parentJobId, setParentJobId] = useState<string | null>(null)
  const [checkoutUrl, setCheckoutUrl] = useState('')
  const [hookNotes, setHookNotes] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [reqBusy, setReqBusy] = useState(false)
  const [reqErr, setReqErr] = useState<string | null>(null)
  const [reqSuccess, setReqSuccess] = useState<string | null>(null)

  const [mDate, setMDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [mSpend, setMSpend] = useState('')
  const [mClicks, setMClicks] = useState('')
  const [mCtr, setMCtr] = useState('')
  const [mCpc, setMCpc] = useState('')
  const [mSales, setMSales] = useState('')
  const [mLabel, setMLabel] = useState('')
  const [mJobId, setMJobId] = useState('')
  const [mBusy, setMBusy] = useState(false)

  const [vslUrl, setVslUrl] = useState('')
  const [vslNotes, setVslNotes] = useState('')
  const [vslBusy, setVslBusy] = useState(false)

  const load = useCallback(() => {
    setErr(null)
    const q = nicheFilter !== 'ALL' ? `?niche=${encodeURIComponent(nicheFilter)}` : ''
    fetch(`/api/cliente/creative-vault/overview${q}`)
      .then((r) => {
        if (!r.ok) throw new Error('load')
        return r.json() as Promise<Overview>
      })
      .then(setData)
      .catch(() => setErr('Não foi possível carregar o Creative Vault.'))
      .finally(() => setLoading(false))
  }, [nicheFilter])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  function openRequest(t: Template, parent: string | null = null) {
    setRequestTpl(t)
    setParentJobId(parent)
    setCheckoutUrl('')
    setHookNotes('')
    setLogoFile(null)
    setReqErr(null)
    setReqSuccess(null)
  }

  async function submitRequest(e: FormEvent) {
    e.preventDefault()
    if (!requestTpl) return
    setReqBusy(true)
    setReqErr(null)
    setReqSuccess(null)
    try {
      const fd = new FormData()
      fd.set('templateId', requestTpl.id)
      fd.set('checkoutUrl', checkoutUrl.trim())
      if (hookNotes.trim()) fd.set('hookNotes', hookNotes.trim())
      if (parentJobId) fd.set('parentJobId', parentJobId)
      if (logoFile) fd.set('logo', logoFile)
      const r = await fetch('/api/cliente/creative-vault/job', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Erro ao enviar')
      setReqSuccess(
        `Pedido registrado — ${j.ticketNumber || 'ticket'}. O time de edição foi notificado.`,
      )
      setRequestTpl(null)
      setParentJobId(null)
      load()
    } catch (ex: unknown) {
      setReqErr(ex instanceof Error ? ex.message : 'Falha ao enviar')
    } finally {
      setReqBusy(false)
    }
  }

  async function submitMetric(e: FormEvent) {
    e.preventDefault()
    setMBusy(true)
    try {
      const r = await fetch('/api/cliente/creative-vault/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metricDate: mDate,
          spend: Number(mSpend.replace(',', '.')),
          clicks: Number(mClicks),
          ctrPercent: Number(mCtr.replace(',', '.')),
          cpc: Number(mCpc.replace(',', '.')),
          sales: Number(mSales.replace(',', '.')),
          label: mLabel.trim() || undefined,
          jobId: mJobId || null,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Erro')
      setMSpend('')
      setMClicks('')
      setMCtr('')
      setMCpc('')
      setMSales('')
      setMLabel('')
      load()
    } catch (ex: unknown) {
      alert(ex instanceof Error ? ex.message : 'Erro')
    } finally {
      setMBusy(false)
    }
  }

  async function deleteMetric(id: string) {
    if (!confirm('Remover esta linha de métricas?')) return
    const r = await fetch(`/api/cliente/creative-vault/metrics/${id}`, { method: 'DELETE' })
    if (r.ok) load()
  }

  async function addVsl(e: FormEvent) {
    e.preventDefault()
    setVslBusy(true)
    try {
      const r = await fetch('/api/cliente/creative-vault/vsl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vslUrl: vslUrl.trim(), notes: vslNotes.trim() || undefined }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Erro')
      setVslUrl('')
      setVslNotes('')
      load()
    } catch (ex: unknown) {
      alert(ex instanceof Error ? ex.message : 'Erro')
    } finally {
      setVslBusy(false)
    }
  }

  async function patchVslDrop(id: string, dropOffSeconds: number | null) {
    const r = await fetch(`/api/cliente/creative-vault/vsl/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dropOffSeconds }),
    })
    if (r.ok) load()
  }

  async function requestVslAdjust(watchId: string, seconds: number, notes: string) {
    if (seconds < 0 || Number.isNaN(seconds)) {
      alert('Informe o momento do drop-off em segundos.')
      return
    }
    const r = await fetch('/api/cliente/creative-vault/vsl-adjustment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vslWatchId: watchId, dropOffSeconds: seconds, notes: notes.trim() || undefined }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      alert(j.error || 'Erro')
      return
    }
    alert(`Pedido enviado — ${j.ticketNumber}. O time recebeu o timestamp para novo corte/narração.`)
    load()
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-gray-500 dark:text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary-600 dark:text-primary-400 flex items-center gap-2">
            <Clapperboard className="w-4 h-4" />
            Módulo 03 — Creative Vault &amp; Agência On-Demand
          </p>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">Arsenal de guerra</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-xl">
            Criativos validados, métricas com diagnóstico, fila de edição e Pitch Watch para a sua VSL — integrado a tickets internos.
          </p>
        </div>
        <Link
          href="/dashboard/cliente/suporte"
          className="text-sm text-primary-600 hover:underline dark:text-primary-400"
        >
          Abrir suporte
        </Link>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          {err}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-white/10 pb-2">
        {(
          [
            ['gallery', 'Galeria', Film],
            ['metrics', 'Métricas', LineChart],
            ['editions', 'Minhas edições', LayoutGrid],
            ['vsl', 'Pitch Watch (VSL)', Sparkles],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? 'bg-primary-600 text-white'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'gallery' && data && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Nicho:</span>
            <button
              type="button"
              onClick={() => setNicheFilter('ALL')}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                nicheFilter === 'ALL'
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
                  : 'bg-gray-100 dark:bg-white/10'
              }`}
            >
              Todos
            </button>
            {data.nicheOptions.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNicheFilter(n)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  nicheFilter === n
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-white/10'
                }`}
              >
                {NICHE_PT[n] || n}
              </button>
            ))}
          </div>

          {data.templates.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum criativo publicado neste filtro.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.templates.map((t) => (
                <article
                  key={t.id}
                  className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 overflow-hidden shadow-sm"
                >
                  <div className="aspect-video bg-black relative">
                    <video
                      src={t.previewVideoUrl}
                      className="w-full h-full object-cover"
                      controls
                      playsInline
                      preload="metadata"
                    />
                  </div>
                  <div className="p-4 space-y-2">
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">
                      {NICHE_PT[t.niche] || t.niche}
                    </span>
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm leading-snug">{t.title}</h3>
                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 rounded px-2 py-1 inline-block">
                      {t.roiLabel}
                    </p>
                    {t.liveProofUnlocked ? (
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                        Live Proof Labs — desbloqueado
                      </p>
                    ) : null}
                    {t.description && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{t.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => openRequest(t, null)}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary-600 text-white text-xs font-medium px-3 py-2"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Solicitar versão personalizada
                      </button>
                      {t.scriptCopy && (
                        <button
                          type="button"
                          onClick={() => setScriptModal(t)}
                          className="text-xs font-medium text-gray-600 dark:text-gray-300 underline"
                        >
                          Ver roteiro
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'metrics' && data && (
        <div className="space-y-6">
          {data.latestDiagnostics.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 p-4 space-y-2">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Diagnóstico (última linha inserida)
              </p>
              <ul className="text-sm text-amber-900/90 dark:text-amber-100/90 list-disc pl-5 space-y-1">
                {data.latestDiagnostics.map((d, i) => (
                  <li key={i}>{d.message}</li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={submitMetric} className="rounded-xl border border-gray-200 dark:border-white/10 p-4 space-y-3 bg-white dark:bg-black/20">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Inserir métricas do dia</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <label className="text-xs space-y-1">
                <span className="text-gray-500">Data</span>
                <input
                  type="date"
                  required
                  value={mDate}
                  onChange={(e) => setMDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
                />
              </label>
              <label className="text-xs space-y-1">
                <span className="text-gray-500">Gasto (R$)</span>
                <input
                  required
                  value={mSpend}
                  onChange={(e) => setMSpend(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
                />
              </label>
              <label className="text-xs space-y-1">
                <span className="text-gray-500">Cliques</span>
                <input
                  required
                  type="number"
                  min={0}
                  value={mClicks}
                  onChange={(e) => setMClicks(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
                />
              </label>
              <label className="text-xs space-y-1">
                <span className="text-gray-500">CTR (%)</span>
                <input
                  required
                  value={mCtr}
                  onChange={(e) => setMCtr(e.target.value)}
                  placeholder="1,25"
                  className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
                />
              </label>
              <label className="text-xs space-y-1">
                <span className="text-gray-500">CPC (R$)</span>
                <input
                  required
                  value={mCpc}
                  onChange={(e) => setMCpc(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
                />
              </label>
              <label className="text-xs space-y-1">
                <span className="text-gray-500">Vendas (R$)</span>
                <input
                  required
                  value={mSales}
                  onChange={(e) => setMSales(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
                />
              </label>
              <label className="text-xs space-y-1 sm:col-span-2">
                <span className="text-gray-500">Campanha (opcional)</span>
                <input
                  value={mLabel}
                  onChange={(e) => setMLabel(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
                />
              </label>
              <label className="text-xs space-y-1 sm:col-span-2">
                <span className="text-gray-500">Vincular a criativo entregue (opcional)</span>
                <select
                  value={mJobId}
                  onChange={(e) => setMJobId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
                >
                  <option value="">—</option>
                  {data.deliveredJobsForSelect.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={mBusy}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {mBusy && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvar linha
            </button>
          </form>

          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-white/5 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Gasto</th>
                  <th className="px-3 py-2">CTR</th>
                  <th className="px-3 py-2">ROI</th>
                  <th className="px-3 py-2">Criativo</th>
                  <th className="px-3 py-2">Alertas</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                {data.metrics.map((m) => (
                  <tr key={m.id} className="dark:text-gray-200">
                    <td className="px-3 py-2 whitespace-nowrap">{m.metricDate}</td>
                    <td className="px-3 py-2">R$ {m.spend.toFixed(2)}</td>
                    <td className="px-3 py-2">{m.ctrPercent.toFixed(2)}%</td>
                    <td className="px-3 py-2">{m.roi != null ? m.roi.toFixed(2) : '—'}</td>
                    <td className="px-3 py-2 text-xs">{m.jobLabel || '—'}</td>
                    <td className="px-3 py-2 text-xs max-w-[220px]">
                      {m.diagnostics.length === 0 ? (
                        '—'
                      ) : (
                        <ul className="space-y-1 text-amber-800 dark:text-amber-200">
                          {m.diagnostics.map((d, i) => (
                            <li key={i}>{d.message}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" className="text-red-600 text-xs underline" onClick={() => deleteMetric(m.id)}>
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.metrics.length === 0 && (
              <p className="p-4 text-sm text-gray-500">Nenhuma métrica ainda. Insira a primeira linha acima.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'editions' && data && (
        <div className="space-y-8">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Cada entrega passa pelo fluxo interno. O selo &quot;Unique Hash&quot; indica limpeza de metadados para reduzir cópia
            detectável.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {KANBAN_ORDER.map((col) => (
              <div key={col} className="rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50/80 dark:bg-black/30 p-3 min-h-[200px]">
                <h3 className="text-xs font-bold text-gray-700 dark:text-gray-200 mb-3 uppercase tracking-wide">
                  {STATUS_K_PT[col]}
                </h3>
                <div className="space-y-2">
                  {data.jobs
                    .filter((j) => j.status === col)
                    .map((j) => (
                      <div
                        key={j.id}
                        className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-black/40 p-3 text-xs space-y-2"
                      >
                        <p className="font-medium text-gray-900 dark:text-white">{j.template.title}</p>
                        <p className="text-gray-500">v{j.iterationNumber}</p>
                        {j.uniqueMetadataHashDone && (
                          <span className="inline-block rounded bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200 px-2 py-0.5 text-[10px] font-semibold">
                            Unique Hash OK
                          </span>
                        )}
                        {j.status === 'ENTREGUE' && j.deliverableUrl && (
                          <a
                            href={j.deliverableUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-primary-600 dark:text-primary-400 underline"
                          >
                            Baixar / abrir vídeo
                          </a>
                        )}
                        {j.status === 'ENTREGUE' && j.ctrSnapshotAtDelivery != null && (
                          <p className="text-gray-600 dark:text-gray-400">CTR na entrega: {j.ctrSnapshotAtDelivery}%</p>
                        )}
                        {j.status === 'ENTREGUE' && (
                          <button
                            type="button"
                            className="text-primary-600 dark:text-primary-400 underline font-medium"
                            onClick={() => openRequest(templateStubFromJob(j), j.id)}
                          >
                            Pedir nova versão (iteração)
                          </button>
                        )}
                      </div>
                    ))}
                  {data.jobs.filter((j) => j.status === col).length === 0 && (
                    <p className="text-gray-400 text-[11px]">Vazio</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Histórico de iterações</h2>
            <div className="space-y-4">
              {data.iterationChains.map((chain) => (
                <div
                  key={chain.rootId}
                  className="rounded-xl border border-gray-200 dark:border-white/10 p-4 text-sm bg-white dark:bg-black/20"
                >
                  <p className="text-xs text-gray-500 mb-2">Cadeia {chain.rootId.slice(0, 8)}…</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {chain.jobs.map((j, idx) => (
                      <span key={j.id} className="inline-flex items-center gap-2">
                        {idx > 0 && <span className="text-gray-400">→</span>}
                        <span className="rounded-lg bg-gray-100 dark:bg-white/10 px-2 py-1 text-xs">
                          v{j.iterationNumber}{' '}
                          {j.ctrSnapshotAtDelivery != null
                            ? `(CTR ${j.ctrSnapshotAtDelivery}%)`
                            : j.status === 'ENTREGUE'
                              ? '(entregue)'
                              : `(${STATUS_K_PT[j.status] || j.status})`}
                        </span>
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">{chain.jobs[0]?.templateTitle}</p>
                </div>
              ))}
              {data.iterationChains.length === 0 && <p className="text-sm text-gray-500">Nenhuma cadeia ainda.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'vsl' && data && (
        <div className="space-y-6">
          <form onSubmit={addVsl} className="rounded-xl border border-gray-200 dark:border-white/10 p-4 space-y-3 bg-white dark:bg-black/20">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Nova VSL</h2>
            <input
              required
              type="url"
              value={vslUrl}
              onChange={(e) => setVslUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
            />
            <textarea
              value={vslNotes}
              onChange={(e) => setVslNotes(e.target.value)}
              placeholder="Notas (opcional)"
              rows={2}
              className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
            />
            <button
              type="submit"
              disabled={vslBusy}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {vslBusy && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar link
            </button>
          </form>

          <div className="space-y-4">
            {data.vslWatches.map((v) => (
              <VslCard key={v.id} v={v} onSaveDrop={patchVslDrop} onRequestAdjust={requestVslAdjust} />
            ))}
            {data.vslWatches.length === 0 && <p className="text-sm text-gray-500">Nenhuma VSL registada.</p>}
          </div>
        </div>
      )}

      {scriptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setScriptModal(null)}>
          <div
            className="max-w-lg w-full rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-gray-900 dark:text-white">{scriptModal.title}</h3>
            <p className="text-xs text-gray-500 mt-1">Biblioteca de scripts — psicologia por cena</p>
            <pre className="mt-4 text-xs whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-[50vh] overflow-y-auto font-sans">
              {scriptModal.scriptCopy}
            </pre>
            <button
              type="button"
              className="mt-4 text-sm text-primary-600 dark:text-primary-400 underline"
              onClick={() => setScriptModal(null)}
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {requestTpl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => !reqBusy && setRequestTpl(null)}>
          <form
            className="max-w-md w-full rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 p-5 shadow-xl space-y-3"
            onSubmit={submitRequest}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-gray-900 dark:text-white">Versão personalizada</h3>
            <p className="text-xs text-gray-500">{requestTpl.title}</p>
            {parentJobId && (
              <p className="text-xs text-amber-700 dark:text-amber-300">Nova iteração ligada ao pedido anterior.</p>
            )}
            <label className="text-xs block space-y-1">
              <span>Link de checkout</span>
              <input
                required
                type="url"
                value={checkoutUrl}
                onChange={(e) => setCheckoutUrl(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
              />
            </label>
            <label className="text-xs block space-y-1">
              <span>Logo (opcional)</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                className="w-full text-xs"
              />
            </label>
            <label className="text-xs block space-y-1">
              <span>Alterações no hook / gancho</span>
              <textarea
                value={hookNotes}
                onChange={(e) => setHookNotes(e.target.value)}
                rows={3}
                placeholder="Ex.: Primeiros 2s mais diretos, CTA mais forte..."
                className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
              />
            </label>
            {reqSuccess ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">{reqSuccess}</p>
            ) : null}
            {reqErr ? <p className="text-xs text-red-500">{reqErr}</p> : null}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={reqBusy}
                className="text-sm text-gray-500"
                onClick={() => setRequestTpl(null)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={reqBusy}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {reqBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                Enviar para a fila
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function VslCard({
  v,
  onSaveDrop,
  onRequestAdjust,
}: {
  v: Overview['vslWatches'][0]
  onSaveDrop: (id: string, s: number | null) => void
  onRequestAdjust: (id: string, s: number, notes: string) => void
}) {
  const [sec, setSec] = useState(v.dropOffSeconds != null ? String(v.dropOffSeconds) : '')
  const [adjNotes, setAdjNotes] = useState('')
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 p-4 space-y-3 bg-white dark:bg-black/20 text-sm">
      <a href={v.vslUrl} target="_blank" rel="noreferrer" className="text-primary-600 dark:text-primary-400 break-all underline">
        {v.vslUrl}
      </a>
      {v.notes && <p className="text-xs text-gray-600 dark:text-gray-400">{v.notes}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs space-y-1">
          <span className="text-gray-500">Drop-off (segundos)</span>
          <input
            type="number"
            min={0}
            value={sec}
            onChange={(e) => setSec(e.target.value)}
            placeholder="ex. 187"
            className="w-32 rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
          />
        </label>
        <button
          type="button"
          className="rounded-lg border border-gray-300 dark:border-white/15 px-3 py-2 text-xs font-medium"
          onClick={() => {
            const n = sec === '' ? null : Number(sec)
            onSaveDrop(v.id, n)
          }}
        >
          Guardar ponto
        </button>
      </div>
      <div className="border-t border-gray-100 dark:border-white/10 pt-3 space-y-2">
        <textarea
          value={adjNotes}
          onChange={(e) => setAdjNotes(e.target.value)}
          placeholder="Contexto para o editor (opcional)"
          rows={2}
          className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-xs dark:text-white"
        />
        <button
          type="button"
          className="rounded-lg bg-amber-600 text-white px-4 py-2 text-xs font-medium"
          onClick={() => {
            if (sec.trim() === '' || Number.isNaN(Number(sec))) {
              alert('Informe o drop-off em segundos (número inteiro).')
              return
            }
            onRequestAdjust(v.id, Math.floor(Number(sec)), adjNotes)
          }}
        >
          Solicitar ajuste de VSL
        </button>
      </div>
    </div>
  )
}
