'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, RefreshCw, Truck, AlertCircle } from 'lucide-react'

const BOTTLENECK_LABELS: Record<string, string> = {
  AGUARDANDO_PRODUCAO: 'Aguardando Produção',
  AGUARDANDO_URL: 'Aguardando URL',
  PRODUCAO_EM_ANDAMENTO: 'Produção em andamento',
  AGUARDANDO_CLIENTE: 'Aguardando Cliente',
  EM_VALIDACAO: 'Em validação',
  NENHUM: 'Sem gargalo',
}

const STATUS_LABELS: Record<string, string> = {
  AGUARDANDO_INICIO: 'Aguardando início',
  EM_ANDAMENTO: 'Em andamento',
  PARCIALMENTE_ENTREGUE: 'Parcialmente entregue',
  FINALIZADA: 'Finalizada',
  ATRASADA: 'Atrasada',
  EM_REPOSICAO: 'Em reposição',
  CANCELADA: 'Cancelada',
}

type Row = {
  id: string
  groupNumber: string
  quantityContracted: number
  quantityDelivered: number
  quantityPending: number
  status: string
  operationalBottleneck: string
  observacoesProducao: string | null
  trackerUrgent: boolean
  rmaOpenCount?: number
  rmaHistoryCount?: number
  client: { clientCode: string | null; user: { name: string | null; email: string } }
  order: { id: string; product: string; quantity: number } | null
}

export function PlugPlayTrackerClient() {
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'overview' | 'pendencias'>('overview')
  const [quickFilter, setQuickFilter] = useState<string>('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('limit', '80')
    if (view === 'pendencias') {
      if (quickFilter) params.set('quickFilter', quickFilter)
    }
    fetch(`/api/entregas-grupos?${params}`)
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d.items) ? d.items : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [view, quickFilter])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const t = setInterval(load, 45_000)
    return () => clearInterval(t)
  }, [load])

  async function saveNotes(id: string) {
    const text = notesDraft[id]
    if (text === undefined) return
    setSavingId(id)
    try {
      await fetch(`/api/entregas-grupos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observacoesProducao: text }),
      })
      load()
    } finally {
      setSavingId(null)
    }
  }

  async function syncQty(id: string) {
    setSyncingId(id)
    try {
      await fetch(`/api/entregas-grupos/${id}/sync-quantities`, { method: 'POST' })
      load()
    } finally {
      setSyncingId(null)
    }
  }

  async function patchField(id: string, patch: Record<string, unknown>) {
    setSavingId(id)
    try {
      await fetch(`/api/entregas-grupos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      load()
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-8 text-zinc-200">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setView('overview')
            setQuickFilter('')
          }}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            view === 'overview' ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400'
          }`}
        >
          Visão geral
        </button>
        <button
          type="button"
          onClick={() => setView('pendencias')}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            view === 'pendencias' ? 'bg-amber-600 text-white' : 'bg-zinc-800 text-zinc-400'
          }`}
        >
          Pendências (produção)
        </button>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
        >
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
        <Link
          href="/dashboard/entregas-grupos"
          className="text-sm text-violet-400 hover:underline ml-auto"
        >
          Grupos de entrega (cadastro)
        </Link>
      </div>

      {view === 'pendencias' ? (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-zinc-500 w-full mb-1">Filtros rápidos</span>
          {[
            { key: 'urgent', label: 'Urgente' },
            { key: 'aguardando_cliente', label: 'Aguardando Cliente' },
            { key: 'em_producao', label: 'Em Produção' },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setQuickFilter(quickFilter === f.key ? '' : f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                quickFilter === f.key ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin" /> A carregar…
        </div>
      ) : items.length === 0 ? (
        <p className="text-zinc-500">Nenhum grupo de entrega encontrado.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((d) => {
            const pct =
              d.quantityContracted > 0
                ? Math.round((d.quantityDelivered / d.quantityContracted) * 100)
                : 0
            const label = d.client.clientCode
              ? `Cliente ${d.client.clientCode}`
              : d.client.user?.name || d.client.user?.email || 'Cliente'
            const bottleneck =
              BOTTLENECK_LABELS[d.operationalBottleneck] || d.operationalBottleneck
            return (
              <div
                key={d.id}
                className={`rounded-xl border p-4 ${
                  d.trackerUrgent ? 'border-amber-500/60 bg-amber-950/20' : 'border-zinc-800 bg-zinc-950/80'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="text-xs text-zinc-500">{d.groupNumber}</p>
                    <p className="font-semibold text-white">{label}</p>
                    {d.order ? (
                      <p className="text-xs text-zinc-500 mt-1">
                        Pedido: {d.order.quantity} solicitadas · {d.order.product}
                      </p>
                    ) : null}
                  </div>
                  {d.trackerUrgent ? (
                    <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                      Urgente
                    </span>
                  ) : null}
                  {(d.rmaOpenCount ?? 0) > 0 ? (
                    <span
                      className="rounded bg-rose-500/25 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-200"
                      title="Cliente com RMA em aberto"
                    >
                      RMA aberto
                    </span>
                  ) : (d.rmaHistoryCount ?? 0) > 0 ? (
                    <span
                      className="rounded bg-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300"
                      title="Histórico de reposição neste cliente"
                    >
                      RMA histórico
                    </span>
                  ) : null}
                </div>

                <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-600 to-emerald-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-sm text-zinc-400 mb-3">
                  {d.quantityDelivered}/{d.quantityContracted} contas ({pct}%) · {d.quantityPending} pendentes
                </p>

                <div className="flex flex-wrap gap-2 mb-3">
                  <span className="rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300">
                    {STATUS_LABELS[d.status] || d.status}
                  </span>
                  <span className="rounded-md bg-zinc-800/80 px-2 py-1 text-[11px] text-sky-300/90 flex items-center gap-1">
                    <Truck className="h-3 w-3" />
                    {bottleneck}
                  </span>
                </div>

                <label className="block text-[11px] text-zinc-500 mb-1">Notas de pendência</label>
                <textarea
                  className="w-full rounded-lg border border-zinc-800 bg-black/40 px-2 py-1.5 text-xs text-zinc-200"
                  rows={2}
                  placeholder="Ex.: Aguardando URL do cliente…"
                  value={notesDraft[d.id] ?? d.observacoesProducao ?? ''}
                  onChange={(e) => setNotesDraft((m) => ({ ...m, [d.id]: e.target.value }))}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => saveNotes(d.id)}
                    disabled={savingId === d.id}
                    className="rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600 disabled:opacity-50"
                  >
                    {savingId === d.id ? '…' : 'Guardar nota'}
                  </button>
                  <button
                    type="button"
                    onClick={() => syncQty(d.id)}
                    disabled={syncingId === d.id}
                    className="rounded bg-emerald-900/50 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-900 disabled:opacity-50"
                  >
                    {syncingId === d.id ? '…' : 'Sincronizar contas'}
                  </button>
                  <label className="flex items-center gap-1 text-[11px] text-zinc-500">
                    <input
                      type="checkbox"
                      checked={d.trackerUrgent}
                      onChange={(e) => patchField(d.id, { trackerUrgent: e.target.checked })}
                    />
                    Urgente
                  </label>
                </div>

                <div className="mt-2">
                  <label className="text-[11px] text-zinc-500">Gargalo</label>
                  <select
                    className="mt-1 w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs"
                    value={d.operationalBottleneck}
                    onChange={(e) => patchField(d.id, { operationalBottleneck: e.target.value })}
                  >
                    {Object.entries(BOTTLENECK_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <Link
                  href={`/dashboard/entregas-grupos/${d.id}`}
                  className="mt-3 inline-block text-xs text-violet-400 hover:underline"
                >
                  Abrir detalhe do grupo →
                </Link>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-zinc-600 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Atualização automática a cada 45s. Quantidades podem ser sincronizadas a partir das contas G2 entregues.
      </p>
    </div>
  )
}
