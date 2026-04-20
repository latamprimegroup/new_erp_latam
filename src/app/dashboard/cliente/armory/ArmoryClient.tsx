'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardCopy,
  Loader2,
  RefreshCw,
  Shield,
  Wrench,
} from 'lucide-react'

type Overview = {
  assets: {
    id: string
    platform: string
    googleAdsCustomerId: string | null
    status: string
    label: string
    uni: { id: string; label: string; fingerprintNote: string } | null
    proxyMasked: string
    locationLine: string
    health: 'green' | 'yellow' | 'red'
    healthLabel: string
    warmUp: { phase: string; label: string }
    adsPowerStartUrl: string | null
    adsPowerInstructions: string
    warmupLog: { t: string; msg: string }[]
    codeG2: string | null
  }[]
  domains: {
    id: string
    domain: string
    sslStatus: string
    shieldEnabled: boolean
    shieldRequestedAt: string | null
    shieldLastWebhookAt: string | null
    shieldWebhookError: string | null
  }[]
  armorySolicitations: {
    id: string
    status: string
    trafficSource: string | null
    operationLevel: string | null
    checkoutUrl: string | null
    createdAt: string
    expectedDeliveryAt: string | null
  }[]
  hints: { rmaSlaHours: number; fingerprintManifesto: string }
}

const SOL_LABEL: Record<string, string> = {
  provisioning: 'Em provisionamento',
  pending: 'Pendente',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
}

export function ArmoryClient() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [reqStep, setReqStep] = useState(0)
  const [trafficSource, setTrafficSource] = useState<'GOOGLE_ADS' | 'META_ADS' | 'TIKTOK_ADS'>('GOOGLE_ADS')
  const [operationLevel, setOperationLevel] = useState<'BEGINNER' | 'SCALE' | 'BLACK'>('BEGINNER')
  const [checkoutUrl, setCheckoutUrl] = useState('')
  const [reqNotes, setReqNotes] = useState('')
  const [reqSubmitting, setReqSubmitting] = useState(false)
  const [reqOk, setReqOk] = useState<string | null>(null)

  const [shieldBusy, setShieldBusy] = useState<string | null>(null)
  const [logOpen, setLogOpen] = useState<string | null>(null)

  const [rmaFor, setRmaFor] = useState<string | null>(null)
  const [rmaFiles, setRmaFiles] = useState<File[]>([])
  const [rmaDetail, setRmaDetail] = useState('')
  const [rmaSubmitting, setRmaSubmitting] = useState(false)

  const load = useCallback(() => {
    setErr(null)
    fetch('/api/cliente/armory/overview')
      .then((r) => {
        if (!r.ok) throw new Error('load')
        return r.json() as Promise<Overview>
      })
      .then(setData)
      .catch(() => setErr('Não foi possível carregar a Central de Ativos.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function submitRequest(e: FormEvent) {
    e.preventDefault()
    setReqSubmitting(true)
    setReqOk(null)
    setErr(null)
    try {
      const r = await fetch('/api/cliente/armory/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trafficSource,
          operationLevel,
          checkoutUrl: checkoutUrl.trim(),
          notes: reqNotes.trim() || undefined,
        }),
      })
      const j = (await r.json().catch(() => ({}))) as { error?: string; ticketNumber?: string }
      if (!r.ok) {
        setErr(j.error || 'Falha ao enviar.')
        return
      }
      setReqOk(`Pedido registado. Ticket ${j.ticketNumber ?? '—'}. O time inicia o provisionamento.`)
      setCheckoutUrl('')
      setReqNotes('')
      setReqStep(0)
      load()
    } finally {
      setReqSubmitting(false)
    }
  }

  async function shieldDomain(domainId: string) {
    setShieldBusy(domainId)
    setErr(null)
    try {
      const r = await fetch('/api/cliente/armory/shield-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainId }),
      })
      const j = (await r.json().catch(() => ({}))) as { error?: string; message?: string; ok?: boolean }
      if (!r.ok) {
        setErr(j.error || j.message || 'Falha na blindagem.')
      }
      load()
    } finally {
      setShieldBusy(null)
    }
  }

  async function submitRma(e: FormEvent) {
    e.preventDefault()
    if (!rmaFor) return
    setRmaSubmitting(true)
    setErr(null)
    try {
      const fd = new FormData()
      fd.set('originalAccountId', rmaFor)
      fd.set('reason', 'SUSPENSAO_IMEDIATA')
      if (rmaDetail.trim()) fd.set('reasonDetail', rmaDetail.trim())
      fd.set(
        'additionalComments',
        `Reposição Armory — meta ${data?.hints.rmaSlaHours ?? 48}h (SLA operacional).`,
      )
      rmaFiles.forEach((f) => fd.append('evidence', f))
      const r = await fetch('/api/cliente/rma', { method: 'POST', body: fd })
      const j = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) {
        setErr(j.error || 'Falha ao abrir reposição.')
        return
      }
      setRmaFor(null)
      setRmaFiles([])
      setRmaDetail('')
      load()
    } finally {
      setRmaSubmitting(false)
    }
  }

  function healthDot(h: 'green' | 'yellow' | 'red') {
    const cls =
      h === 'green' ? 'bg-emerald-500' : h === 'yellow' ? 'bg-amber-400' : 'bg-red-500'
    return <span className={`inline-block w-2.5 h-2.5 rounded-full ${cls}`} />
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Wrench className="w-7 h-7 text-primary-600 dark:text-primary-400" />
            Central de Ativos
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Módulo 02 — provisionamento, identidade e blindagem. Menos fricção, mais disciplina operacional.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true)
            load()
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-white/15 px-3 py-2 text-sm dark:text-white"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-800 dark:text-red-200 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {err}
        </div>
      )}

      {data && (
        <section className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-ads-navy/40 p-5">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Fingerprint &amp; IP</h2>
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{data.hints.fingerprintManifesto}</p>
        </section>
      )}

      <section className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-ads-navy/40 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Solicitar ativo (One-Click)</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Abre ticket interno + fila de operações. Estado: <strong>Em provisionamento</strong>. Checkout usado para
          preparar S2S / Tracker.
        </p>
        {reqOk && (
          <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {reqOk}
          </p>
        )}
        <div className="space-y-4">
          {reqStep === 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">1/3 — Fonte de tráfego</p>
              <div className="flex flex-wrap gap-2">
                {(['GOOGLE_ADS', 'META_ADS', 'TIKTOK_ADS'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTrafficSource(k)}
                    className={`rounded-lg px-3 py-2 text-sm border ${
                      trafficSource === k
                        ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200'
                        : 'border-gray-200 dark:border-white/15 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {k === 'GOOGLE_ADS' ? 'Google Ads' : k === 'META_ADS' ? 'Meta Ads' : 'TikTok Ads'}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="mt-4 text-sm text-primary-600 dark:text-primary-400 flex items-center gap-1"
                onClick={() => setReqStep(1)}
              >
                Seguinte <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
          {reqStep === 1 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">2/3 — Nível de operação</p>
              <div className="flex flex-wrap gap-2">
                {(['BEGINNER', 'SCALE', 'BLACK'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setOperationLevel(k)}
                    className={`rounded-lg px-3 py-2 text-sm border ${
                      operationLevel === k
                        ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/30'
                        : 'border-gray-200 dark:border-white/15'
                    }`}
                  >
                    {k === 'BEGINNER' ? 'Iniciante' : k === 'SCALE' ? 'Escala' : 'Black'}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <button type="button" className="text-sm text-gray-500" onClick={() => setReqStep(0)}>
                  Voltar
                </button>
                <button
                  type="button"
                  className="text-sm text-primary-600 flex items-center gap-1"
                  onClick={() => setReqStep(2)}
                >
                  Seguinte <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          {reqStep === 2 && (
            <form onSubmit={submitRequest} className="space-y-3">
              <p className="text-xs font-medium text-gray-500">3/3 — Checkout (link da plataforma de vendas)</p>
              <input
                required
                type="url"
                value={checkoutUrl}
                onChange={(e) => setCheckoutUrl(e.target.value)}
                placeholder="https://pay.seudominio.com/..."
                className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/20 px-3 py-2 text-sm dark:text-white"
              />
              <textarea
                value={reqNotes}
                onChange={(e) => setReqNotes(e.target.value)}
                placeholder="Notas opcionais para operações"
                rows={2}
                className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/20 px-3 py-2 text-sm dark:text-white"
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="text-sm text-gray-500" onClick={() => setReqStep(1)}>
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={reqSubmitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {reqSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Enviar pedido
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {data && data.armorySolicitations.length > 0 && (
        <section className="rounded-xl border border-gray-200 dark:border-white/10 p-5">
          <h3 className="text-sm font-semibold mb-3 dark:text-white">Pedidos Armory recentes</h3>
          <ul className="text-xs space-y-2 text-gray-600 dark:text-gray-400">
            {data.armorySolicitations.map((s) => (
              <li key={s.id} className="flex flex-wrap gap-2 justify-between border-b border-gray-100 dark:border-white/5 pb-2">
                <span>{SOL_LABEL[s.status] || s.status}</span>
                <span className="font-mono text-[10px]">{s.id.slice(0, 10)}…</span>
                {s.expectedDeliveryAt && (
                  <span>Previsão: {new Date(s.expectedDeliveryAt).toLocaleString('pt-BR')}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-semibold dark:text-white">Operações ativas (UNIs)</h2>
          <Link href="/dashboard/cliente/contas" className="text-xs text-primary-600 dark:text-primary-400">
            Ver detalhe completo
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[920px]">
            <thead className="text-[10px] uppercase text-gray-500 border-b border-gray-200 dark:border-white/10">
              <tr>
                <th className="text-left p-3">Ativo</th>
                <th className="text-left p-3">UNI</th>
                <th className="text-left p-3">Blindagem / local</th>
                <th className="text-left p-3">Saúde</th>
                <th className="text-left p-3">Acesso</th>
                <th className="text-right p-3">Garantia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {!data || data.assets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    {loading ? 'A carregar…' : 'Sem ativos entregues ainda. Faça um pedido acima.'}
                  </td>
                </tr>
              ) : (
                data.assets.map((a) => (
                  <tr key={a.id} className="dark:text-gray-200">
                    <td className="p-3">
                      <div className="font-mono text-[11px]">{a.label}</div>
                      <div className="text-[10px] text-gray-500">{a.platform}</div>
                      <button
                        type="button"
                        className="text-[10px] text-primary-600 mt-1"
                        onClick={() => setLogOpen(logOpen === a.id ? null : a.id)}
                      >
                        {logOpen === a.id ? 'Ocultar' : 'Ver'} log de aquecimento
                      </button>
                      {logOpen === a.id && (
                        <ul className="mt-2 text-[10px] text-gray-500 space-y-1 max-w-xs">
                          {a.warmupLog.map((w, i) => (
                            <li key={i}>
                              {w.t && <span className="opacity-70">{w.t} — </span>}
                              {w.msg}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="p-3">
                      {a.uni ? (
                        <>
                          <div className="font-semibold">{a.uni.label}</div>
                          <p className="text-[10px] text-gray-500 mt-1 leading-snug">{a.uni.fingerprintNote}</p>
                        </>
                      ) : (
                        <span className="text-gray-500">Associe uma UNI na War Room</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="font-mono">{a.proxyMasked}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{a.locationLine}</div>
                      <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">{a.warmUp.label}</div>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1.5">
                        {healthDot(a.health)}
                        {a.healthLabel}
                      </span>
                    </td>
                    <td className="p-3">
                      {a.adsPowerStartUrl ? (
                        <div className="space-y-1">
                          <a
                            href={a.adsPowerStartUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block text-primary-600 dark:text-primary-400 text-[11px] font-medium"
                          >
                            Abrir operação (browser isolado)
                          </a>
                          <button
                            type="button"
                            className="block text-[10px] text-gray-500"
                            onClick={() => {
                              void navigator.clipboard.writeText(a.adsPowerStartUrl!)
                            }}
                          >
                            <ClipboardCopy className="w-3 h-3 inline" /> Copiar link do browser
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-500 text-[10px]">{a.adsPowerInstructions}</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => setRmaFor(a.id)}
                        className="text-rose-600 dark:text-rose-400 text-[11px] font-medium"
                      >
                        Solicitar reposição
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 dark:border-white/10 p-6">
        <h2 className="text-lg font-semibold dark:text-white flex items-center gap-2 mb-2">
          <Shield className="w-5 h-5" />
          Domínios — blindagem (Shield)
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Envia pedido ao servidor de borda (Gerson) para proxy reverso + injeção Tracker. Requer variáveis{' '}
          <code className="text-gray-600 dark:text-gray-400">ARMORY_DOMAIN_SHIELD_WEBHOOK_URL</code> e{' '}
          <code className="text-gray-600 dark:text-gray-400">SECRET</code>.
        </p>
        {!data || data.domains.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nenhum domínio registado.{' '}
            <Link href="/dashboard/cliente/landing" className="text-primary-600">
              Fábrica de Landings
            </Link>
          </p>
        ) : (
          <ul className="space-y-3">
            {data.domains.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 border border-gray-100 dark:border-white/10 rounded-lg p-3"
              >
                <div>
                  <div className="font-mono text-sm dark:text-white">{d.domain}</div>
                  <div className="text-[10px] text-gray-500">
                    SSL: {d.sslStatus}
                    {d.shieldEnabled ? ' · Blindagem ativa' : ''}
                    {d.shieldWebhookError && !d.shieldEnabled ? ` · ${d.shieldWebhookError}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={shieldBusy === d.id}
                  onClick={() => void shieldDomain(d.id)}
                  className="rounded-lg border border-primary-600 text-primary-700 dark:text-primary-300 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  {shieldBusy === d.id ? 'A processar…' : 'Ativar blindagem (Shield)'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-5">
        <h3 className="text-sm font-semibold dark:text-white mb-1">Garantia &amp; kill-switch</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          Conta suspensa? Envie print do bloqueio. Meta de fila: até{' '}
          <strong>{data?.hints.rmaSlaHours ?? 48}h</strong> (configurável <code>ARMORY_RMA_SLA_HOURS</code>).
        </p>
        <Link href="/dashboard/cliente/reposicao" className="text-xs text-primary-600 dark:text-primary-400">
          Abrir fluxo completo de RMA
        </Link>
      </section>

      {rmaFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white dark:bg-ads-navy rounded-xl max-w-md w-full p-6 shadow-xl">
            <h4 className="font-semibold dark:text-white mb-2">Reposição — suspensão</h4>
            <p className="text-xs text-gray-500 mb-3">Anexe o print do bloqueio (obrigatório para inteligência).</p>
            <form onSubmit={submitRma} className="space-y-3">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setRmaFiles(Array.from(e.target.files || []))}
                className="text-xs w-full"
              />
              <textarea
                value={rmaDetail}
                onChange={(e) => setRmaDetail(e.target.value)}
                placeholder="Detalhes (opcional)"
                rows={3}
                className="w-full rounded-lg border border-gray-300 dark:border-white/15 text-sm p-2 dark:bg-black/20 dark:text-white"
              />
              <div className="flex gap-2 justify-end">
                <button type="button" className="text-sm text-gray-500" onClick={() => setRmaFor(null)}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={rmaSubmitting || rmaFiles.length === 0}
                  className="rounded-lg bg-rose-600 text-white px-3 py-2 text-sm disabled:opacity-40"
                >
                  {rmaSubmitting ? 'A enviar…' : 'Enfileirar reposição'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
