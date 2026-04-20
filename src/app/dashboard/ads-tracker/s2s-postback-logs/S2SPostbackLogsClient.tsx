'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw, RotateCcw, X } from 'lucide-react'

type Overview = {
  hours: number
  webhooksReceived: number
  attributedConversions: number
  orphanSignals: number
  delayedMatchSeconds: number
  note?: string
}

type Tunnel = {
  viaEphemeral: boolean
  outcome: string
  paySlugOrToken: string | null
  initiatedAt: string
} | null

type EventRow = {
  id: string
  platformOrderId: string | null
  platform: string
  offerName: string
  eventLabel: string
  paymentState: string
  amountGross: string
  currency: string
  gclid: string | null
  gclidShort: string | null
  googleStatus: string
  googleDetail: string
  delayedMatchPending: boolean
  orphanSignal: boolean
  pricingAlert: string | null
  checkoutGatewayHost: string | null
  checkoutTunnel: Tunnel
  createdAt: string
  updatedAt: string
}

function googleStatusStyle(ui: string): string {
  switch (ui) {
    case 'SENT':
      return 'text-emerald-400'
    case 'FAILED':
      return 'text-red-400'
    case 'QUEUED':
    case 'PENDING_LEGACY':
      return 'text-amber-300'
    case 'SKIPPED':
    case 'NONE':
      return 'text-zinc-500'
    case 'DISABLED':
      return 'text-zinc-600'
    default:
      return 'text-zinc-400'
  }
}

function googleStatusLabel(ui: string): string {
  switch (ui) {
    case 'SENT':
      return 'Enviado ao Google'
    case 'FAILED':
      return 'Erro API'
    case 'QUEUED':
      return 'Na fila'
    case 'PENDING_LEGACY':
      return 'Pendente (legado)'
    case 'SKIPPED':
      return 'Ignorado / filtro'
    case 'NONE':
      return 'Sem envio'
    case 'DISABLED':
      return 'Envio desligado (.env)'
    default:
      return ui
  }
}

export function S2SPostbackLogsClient({ canReprocess }: { canReprocess: boolean }) {
  const [hours, setHours] = useState(72)
  const [payment, setPayment] = useState<'all' | 'approved' | 'boleto' | 'pix'>('all')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [total, setTotal] = useState(0)
  const [offlineEnabled, setOfflineEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [drawerPayload, setDrawerPayload] = useState<string | null>(null)
  const [drawerMeta, setDrawerMeta] = useState<Record<string, unknown> | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [reprocBusy, setReprocBusy] = useState<string | null>(null)

  const take = 40

  const buildEventsUrl = useCallback(
    (nextSkip: number) => {
      const p = new URLSearchParams()
      p.set('hours', String(hours))
      p.set('take', String(take))
      p.set('skip', String(nextSkip))
      if (payment !== 'all') p.set('payment', payment)
      return `/api/admin/tracker-s2s-logs/events?${p.toString()}`
    },
    [hours, take, payment]
  )

  const loadFresh = useCallback(async () => {
    setErr(null)
    setLoading(true)
    try {
      const [o, e] = await Promise.all([
        fetch(`/api/admin/tracker-s2s-logs/overview?hours=${hours}`).then((r) => {
          if (!r.ok) throw new Error('overview')
          return r.json() as Promise<Overview>
        }),
        fetch(buildEventsUrl(0)).then((r) => {
          if (!r.ok) throw new Error('events')
          return r.json() as Promise<{ events: EventRow[]; total: number; offlineEnabled: boolean }>
        }),
      ])
      setOverview(o)
      setEvents(e.events || [])
      setTotal(e.total ?? 0)
      setOfflineEnabled(!!e.offlineEnabled)
    } catch {
      setErr('Não foi possível carregar os dados S2S.')
    } finally {
      setLoading(false)
    }
  }, [hours, buildEventsUrl])

  useEffect(() => {
    void loadFresh()
  }, [loadFresh])

  async function loadMore() {
    const nextSkip = events.length
    if (nextSkip >= total) return
    setErr(null)
    setLoading(true)
    try {
      const r = await fetch(buildEventsUrl(nextSkip))
      if (!r.ok) throw new Error('events')
      const e = (await r.json()) as { events: EventRow[]; total: number }
      setEvents((prev) => [...prev, ...(e.events || [])])
      setTotal(e.total ?? total)
    } catch {
      setErr('Falha ao carregar mais.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!drawerId) {
      setDrawerPayload(null)
      setDrawerMeta(null)
      return
    }
    setDrawerLoading(true)
    fetch(`/api/admin/tracker-s2s-logs/events/${drawerId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { payloadRaw?: string; event?: Record<string, unknown> } | null) => {
        setDrawerPayload(j?.payloadRaw ?? null)
        setDrawerMeta(j?.event ?? null)
      })
      .catch(() => {
        setDrawerPayload(null)
        setDrawerMeta(null)
      })
      .finally(() => setDrawerLoading(false))
  }, [drawerId])

  async function reprocess(id: string) {
    if (!canReprocess) return
    if (!confirm('Re-processar envio Google / fila para este sinal?')) return
    setReprocBusy(id)
    setErr(null)
    try {
      const r = await fetch(`/api/admin/tracker-s2s-logs/events/${id}/reprocess`, { method: 'POST' })
      const j = (await r.json()) as { ok?: boolean; message?: string }
      if (!r.ok) setErr(j.message || 'Reprocessamento falhou.')
      else await loadFresh()
    } catch {
      setErr('Reprocessamento falhou.')
    } finally {
      setReprocBusy(null)
    }
  }

  const hasMore = events.length < total

  return (
    <div className="space-y-6">
      {err && (
        <p className="text-sm text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {err}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
        <span>
          Google offline:{' '}
          {offlineEnabled ? (
            <span className="text-emerald-400/90">TRACKER_OFFLINE_GADS_ENABLED=1</span>
          ) : (
            <span className="text-amber-400/90">desligado — estados refletem fila/config apenas</span>
          )}
        </span>
      </div>

      {overview && (
        <div className="grid sm:grid-cols-3 gap-3">
          <KpiCard label="Webhooks (atividade)" value={overview.webhooksReceived} sub="Sinais tocados na janela" />
          <KpiCard
            label="Com GCLID"
            value={overview.attributedConversions}
            sub="Atribuíveis a clique pago"
          />
          <KpiCard
            label="Órfãos (pós-espera)"
            value={overview.orphanSignals}
            sub={`Sem GCLID após ${overview.delayedMatchSeconds}s`}
          />
        </div>
      )}

      {overview?.note && (
        <p className="text-[10px] text-zinc-600 border border-zinc-800 rounded-lg p-2 bg-zinc-950/40">{overview.note}</p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-zinc-400 space-y-1">
          Janela (h)
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="block rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm text-white"
          >
            {[24, 48, 72, 168].map((h) => (
              <option key={h} value={h}>
                {h}h
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400 space-y-1">
          Estado pagamento
          <select
            value={payment}
            onChange={(e) => setPayment(e.target.value as typeof payment)}
            className="block rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm text-white min-w-[180px]"
          >
            <option value="all">Todos</option>
            <option value="approved">Vendas aprovadas</option>
            <option value="boleto">Boletos pendentes</option>
            <option value="pix">Pix pendentes</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void loadFresh()}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-zinc-200">Eventos S2S</h3>
          <span className="text-[10px] text-zinc-500">
            {events.length} / {total}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[1180px]">
            <thead className="text-[10px] uppercase text-zinc-500 border-b border-zinc-800">
              <tr>
                <th className="text-left p-2">Transação</th>
                <th className="text-left p-2">Plataforma</th>
                <th className="text-left p-2">Evento</th>
                <th className="text-right p-2">Valor</th>
                <th className="text-left p-2">GCLID</th>
                <th className="text-left p-2">Google</th>
                <th className="text-left p-2">Checkout</th>
                <th className="text-right p-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {events.length === 0 && !loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-zinc-500">
                    Sem eventos nesta vista.
                  </td>
                </tr>
              ) : (
                events.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-zinc-900/40 cursor-pointer"
                    onClick={() => setDrawerId(r.id)}
                  >
                    <td className="p-2 font-mono text-zinc-200 max-w-[140px] truncate" title={r.platformOrderId || r.id}>
                      {r.platformOrderId || r.id.slice(0, 12)}
                    </td>
                    <td className="p-2 text-zinc-400">
                      <div>{r.platform}</div>
                      <div className="text-[10px] text-zinc-600 truncate max-w-[120px]" title={r.offerName}>
                        {r.offerName}
                      </div>
                    </td>
                    <td className="p-2">
                      <span className="text-zinc-200">{r.eventLabel}</span>
                      {r.delayedMatchPending && (
                        <div className="text-[10px] text-sky-400/90">Fila casamento GCLID</div>
                      )}
                      {r.orphanSignal && !r.gclid && (
                        <div className="text-[10px] text-amber-500/90">Órfão</div>
                      )}
                    </td>
                    <td className="p-2 text-right align-top">
                      <div className="font-mono text-zinc-200 whitespace-nowrap">
                        {r.currency}{' '}
                        {Number(r.amountGross).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                      {r.pricingAlert && (
                        <div
                          className="text-[10px] text-amber-400/90 mt-0.5 max-w-[140px] ml-auto text-right"
                          title={r.pricingAlert}
                        >
                          <AlertTriangle className="w-3 h-3 inline mr-0.5 align-middle" />
                          Precificação
                        </div>
                      )}
                    </td>
                    <td className="p-2 font-mono text-[10px] text-zinc-500 max-w-[100px] truncate" title={r.gclid || ''}>
                      {r.gclidShort || '—'}
                    </td>
                    <td className="p-2">
                      <span className={googleStatusStyle(r.googleStatus)}>{googleStatusLabel(r.googleStatus)}</span>
                      <div className="text-[10px] text-zinc-600 max-w-[160px] truncate" title={r.googleDetail}>
                        {r.googleDetail}
                      </div>
                    </td>
                    <td className="p-2 text-[10px] text-zinc-500 max-w-[140px]">
                      <div className="truncate" title={r.checkoutGatewayHost || ''}>
                        {r.checkoutGatewayHost || '—'}
                      </div>
                      {r.checkoutTunnel && (
                        <div className="text-zinc-600 truncate" title={r.checkoutTunnel.outcome}>
                          {r.checkoutTunnel.viaEphemeral ? 'ephemeral' : 'redirect'} · {r.checkoutTunnel.outcome}
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-right" onClick={(e) => e.stopPropagation()}>
                      {canReprocess && (
                        <button
                          type="button"
                          disabled={reprocBusy === r.id}
                          onClick={() => void reprocess(r.id)}
                          className="inline-flex items-center gap-1 text-sky-400 hover:underline text-[11px] disabled:opacity-40"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Re-processar
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <div className="p-3 border-t border-zinc-800 text-center">
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadMore()}
              className="text-sm text-sky-400 hover:underline disabled:opacity-40"
            >
              Carregar mais
            </button>
          </div>
        )}
      </div>

      {drawerId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setDrawerId(null)}>
          <aside
            className="w-full max-w-xl h-full bg-zinc-950 border-l border-zinc-800 overflow-y-auto p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start gap-2">
              <h3 className="text-sm font-semibold text-zinc-100">Payload bruto (debug)</h3>
              <button
                type="button"
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400"
                aria-label="Fechar"
                onClick={() => setDrawerId(null)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {drawerLoading && <p className="text-sm text-zinc-500">A carregar…</p>}
            {drawerMeta && (drawerMeta as { pricingAlert?: string | null }).pricingAlert && (
              <div className="rounded-lg border border-amber-900/50 bg-amber-950/25 p-2 text-xs text-amber-100/90">
                {(drawerMeta as { pricingAlert: string }).pricingAlert}
              </div>
            )}
            {drawerMeta && (
              <dl className="text-xs space-y-2 text-zinc-400">
                <div>
                  <dt className="text-zinc-500">Dispatches (M08)</dt>
                  <dd className="font-mono text-[10px] text-zinc-300 whitespace-pre-wrap">
                    {JSON.stringify((drawerMeta as { dispatches?: unknown }).dispatches, null, 2)}
                  </dd>
                </div>
              </dl>
            )}
            <pre className="text-[10px] font-mono text-zinc-300 bg-black/50 border border-zinc-800 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
              {drawerPayload || '—'}
            </pre>
            {canReprocess && drawerId && (
              <button
                type="button"
                disabled={reprocBusy === drawerId}
                onClick={() => void reprocess(drawerId)}
                className="w-full py-2 rounded-lg bg-sky-950 border border-sky-800 text-sm text-sky-100 disabled:opacity-40"
              >
                Re-processar postback / envio
              </button>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

function KpiCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-4">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500 font-semibold mb-1">{label}</p>
      <p className="text-2xl font-mono text-white">{value}</p>
      <p className="text-[11px] text-zinc-600 mt-1">{sub}</p>
    </div>
  )
}
