'use client'

import { Fragment, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

type ClientInsight = {
  totalSpent?: unknown
  roiCrmStatus?: string
  metrics?: {
    ltvLiquido?: unknown
    ltvReal?: unknown
    segmento?: string | null
    scoreValor?: number | null
  } | null
  user: { name: string | null; email: string }
}

type Solicitation = {
  id: string
  quantity: number
  product: string
  accountType: string
  country: string | null
  referenceOrderId: string | null
  status: string
  notes: string | null
  expectedDeliveryAt: string | null
  createdAt: string
  client: ClientInsight
}

type Insights = {
  demandByProduct: { key: string; quantity: number }[]
  pendingCount: number
}

type StockMatch = {
  id: string
  type: string
  platform: string
  salePrice: number | null
  niche: string | null
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em atendimento',
  completed: 'Finalizada',
  cancelled: 'Cancelada',
}

function num(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  return Number(v) || 0
}

function clientTier(c: ClientInsight): string | null {
  const seg = (c.metrics?.segmento ?? '').toUpperCase()
  const ltv = num(c.metrics?.ltvLiquido) || num(c.metrics?.ltvReal)
  const spent = num(c.totalSpent)
  const st = (c.roiCrmStatus ?? '').toUpperCase()
  if (st === 'VIP' || st.includes('VIP')) return 'Cliente VIP'
  if (seg.includes('VIP') || seg.includes('OURO') || seg.includes('ELITE')) return 'Segmento premium'
  if ((c.metrics?.scoreValor ?? 0) >= 80) return 'Score alto'
  if (ltv >= 30000 || spent >= 30000) return 'Alto LTV / gasto'
  return null
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AdminSolicitacoesPage() {
  const [solicitations, setSolicitations] = useState<Solicitation[]>([])
  const [insights, setInsights] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [updating, setUpdating] = useState<string | null>(null)
  const [deliveryDraft, setDeliveryDraft] = useState<Record<string, string>>({})
  const [matches, setMatches] = useState<Record<string, StockMatch[] | 'loading' | 'error'>>({})
  const [notifying, setNotifying] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const params = filterStatus ? `?status=${filterStatus}` : ''
    fetch(`/api/admin/solicitacoes${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) {
          setSolicitations(d)
          setInsights(null)
        } else {
          setSolicitations(d.items ?? [])
          setInsights(d.insights ?? null)
        }
      })
      .finally(() => setLoading(false))
  }, [filterStatus])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const m: Record<string, string> = {}
    for (const s of solicitations) {
      m[s.id] = toDatetimeLocal(s.expectedDeliveryAt)
    }
    setDeliveryDraft(m)
  }, [solicitations])

  async function handleUpdateStatus(id: string, status: string) {
    setUpdating(id)
    try {
      const res = await fetch('/api/admin/solicitacoes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (res.ok) load()
    } finally {
      setUpdating(null)
    }
  }

  async function saveExpectedDelivery(id: string) {
    const raw = deliveryDraft[id]?.trim()
    setUpdating(id)
    try {
      const res = await fetch('/api/admin/solicitacoes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          expectedDeliveryAt: raw ? new Date(raw).toISOString() : null,
        }),
      })
      if (res.ok) load()
      else alert((await res.json()).error || 'Erro')
    } finally {
      setUpdating(null)
    }
  }

  async function loadMatches(id: string) {
    setMatches((prev) => ({ ...prev, [id]: 'loading' }))
    try {
      const res = await fetch(`/api/admin/solicitacoes/match-stock?solicitationId=${encodeURIComponent(id)}`)
      const data = await res.json()
      if (res.ok) setMatches((prev) => ({ ...prev, [id]: data.matched ?? [] }))
      else setMatches((prev) => ({ ...prev, [id]: 'error' }))
    } catch {
      setMatches((prev) => ({ ...prev, [id]: 'error' }))
    }
  }

  async function pingManagers() {
    setNotifying(true)
    try {
      const res = await fetch('/api/admin/solicitacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'notify_managers_demand' }),
      })
      const data = await res.json()
      if (res.ok) alert(`Notificação in-app enviada a ${data.notified} gestor(es).`)
      else alert(data.error || 'Erro')
    } finally {
      setNotifying(false)
    }
  }

  return (
    <div>
      <div className="flex gap-4 items-center mb-6">
        <Link href="/dashboard/admin" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
          ← Admin
        </Link>
        <h1 className="heading-1">Solicitações de Novas Contas</h1>
      </div>

      {insights && insights.demandByProduct.length > 0 && (
        <div className="card mb-4">
          <div className="flex flex-wrap justify-between items-start gap-3 mb-3">
            <div>
              <h2 className="font-semibold">Oportunidades (demanda ativa)</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Agregado de solicitações pendentes + em atendimento · {insights.pendingCount} solicitação(ões) ativa(s)
              </p>
            </div>
            <button
              type="button"
              disabled={notifying}
              onClick={() => void pingManagers()}
              className="btn-secondary text-sm py-1.5"
            >
              {notifying ? '…' : 'Avisar gestores (in-app)'}
            </button>
          </div>
          <ul className="flex flex-wrap gap-2 text-sm">
            {insights.demandByProduct.map((d) => (
              <li
                key={d.key}
                className="px-2 py-1 rounded bg-slate-100 dark:bg-white/10 text-gray-800 dark:text-gray-200"
              >
                <span className="font-medium">{d.key}</span>
                <span className="text-gray-500 dark:text-gray-400"> — {d.quantity} un.</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
            WhatsApp automático ao cliente com a previsão ainda não está ligado — use a previsão abaixo e contato manual até integrar API.
          </p>
        </div>
      )}

      <div className="card">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          <h2 className="font-semibold">Solicitações de clientes</h2>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field py-1.5 px-2 w-44 text-sm"
          >
            <option value="">Todos</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="text-gray-500 py-8">Carregando...</p>
        ) : solicitations.length === 0 ? (
          <p className="text-gray-500 py-8">Nenhuma solicitação.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                  <th className="pb-2 pr-4">Data</th>
                  <th className="pb-2 pr-4">Cliente / prioridade</th>
                  <th className="pb-2 pr-4">Quantidade</th>
                  <th className="pb-2 pr-4">Produto / Tipo</th>
                  <th className="pb-2 pr-4">Base</th>
                  <th className="pb-2 pr-4">Previsão entrega</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {solicitations.map((s) => {
                  const tier = clientTier(s.client)
                  const matchState = matches[s.id]
                  return (
                    <Fragment key={s.id}>
                      <tr className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                        <td className="py-3 pr-4 whitespace-nowrap">
                          {new Date(s.createdAt).toLocaleString('pt-BR')}
                        </td>
                        <td className="py-3 pr-4">
                          {s.client.user.name || s.client.user.email}
                          <br />
                          <span className="text-xs text-gray-500">{s.client.user.email}</span>
                          {tier && (
                            <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                              {tier}
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4 font-medium">{s.quantity}</td>
                        <td className="py-3 pr-4">
                          {s.product} ({s.accountType})
                        </td>
                        <td className="py-3 pr-4">{s.referenceOrderId ? 'Última compra' : '—'}</td>
                        <td className="py-3 pr-4">
                          <input
                            type="datetime-local"
                            className="input-field py-1 text-xs w-[180px]"
                            value={deliveryDraft[s.id] ?? ''}
                            onChange={(e) =>
                              setDeliveryDraft((d) => ({ ...d, [s.id]: e.target.value }))
                            }
                          />
                          <button
                            type="button"
                            className="block mt-1 text-xs text-primary-600 hover:underline"
                            disabled={updating === s.id}
                            onClick={() => void saveExpectedDelivery(s.id)}
                          >
                            Salvar previsão
                          </button>
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${
                              s.status === 'completed'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                                : s.status === 'in_progress'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100'
                                  : s.status === 'cancelled'
                                    ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
                            }`}
                          >
                            {STATUS_LABELS[s.status] ?? s.status}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex flex-col gap-1 items-start">
                            {s.status === 'pending' && (
                              <div className="flex gap-1 flex-wrap">
                                <button
                                  onClick={() => handleUpdateStatus(s.id, 'in_progress')}
                                  disabled={!!updating}
                                  className="text-xs text-amber-600 hover:underline"
                                >
                                  Em atendimento
                                </button>
                                <span className="text-gray-400">|</span>
                                <button
                                  onClick={() => handleUpdateStatus(s.id, 'completed')}
                                  disabled={!!updating}
                                  className="text-xs text-green-600 hover:underline"
                                >
                                  Finalizar
                                </button>
                              </div>
                            )}
                            {s.status === 'in_progress' && (
                              <button
                                onClick={() => handleUpdateStatus(s.id, 'completed')}
                                disabled={!!updating}
                                className="text-xs text-green-600 hover:underline"
                              >
                                Finalizar
                              </button>
                            )}
                            <button
                              type="button"
                              className="text-xs text-primary-600 hover:underline"
                              onClick={() => void loadMatches(s.id)}
                            >
                              Ver estoque compatível
                            </button>
                            <Link
                              href="/dashboard/estoque"
                              className="text-xs text-gray-500 hover:underline dark:text-gray-400"
                            >
                              Abrir estoque
                            </Link>
                          </div>
                        </td>
                      </tr>
                      {matchState && matchState !== 'loading' && matchState !== 'error' && (
                        <tr key={`${s.id}-m`} className="bg-slate-50 dark:bg-white/5">
                          <td colSpan={8} className="px-4 py-2 text-xs">
                            <span className="font-medium">Ofertas no estoque (aproximação):</span>{' '}
                            {matchState.length === 0 ? (
                              'Nenhuma conta AVAILABLE encontrada com tipo/plataforma semelhantes.'
                            ) : (
                              <ul className="mt-1 space-y-1">
                                {matchState.slice(0, 8).map((a) => (
                                  <li key={a.id}>
                                    <code className="text-[11px]">{a.id.slice(0, 8)}</code> — {a.platform}{' '}
                                    {a.type}
                                    {a.salePrice != null
                                      ? ` — R$ ${a.salePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                      : ''}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                      {matchState === 'loading' && (
                        <tr key={`${s.id}-ml`} className="bg-slate-50 dark:bg-white/5">
                          <td colSpan={8} className="px-4 py-2 text-xs text-gray-500">
                            Buscando estoque…
                          </td>
                        </tr>
                      )}
                      {matchState === 'error' && (
                        <tr key={`${s.id}-me`} className="bg-slate-50 dark:bg-white/5">
                          <td colSpan={8} className="px-4 py-2 text-xs text-red-600">
                            Erro ao buscar estoque.
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
