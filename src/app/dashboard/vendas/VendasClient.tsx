'use client'

import { useState, useEffect } from 'react'

type Client = {
  id: string
  user: { name: string | null; email: string }
}

type Reputation = {
  score: number | null
  refundCount: number
  nicheTag: string | null
  plugPlayErrorCount: number
  averageAccountLifetimeDays: number | null
}

type ClientLTV = {
  reputation?: Reputation | null
  client: {
    id: string
    user: { name: string | null; email: string; phone: string | null }
    whatsapp: string | null
    country: string | null
    lastPurchaseAt: string | null
    totalSpent: number
    totalAccountsBought: number
    ordersCount: number
  }
  orders: Array<{
    id: string
    product: string
    accountType: string
    quantity: number
    value: number
    status: string
    paidAt: string | null
    createdAt: string
  }>
  accountsDelivered: Array<{
    id: string
    platform: string
    type: string
    deliveredAt: string | null
    email?: string | null
    cnpj?: string | null
  }>
}

type Order = {
  id: string
  product: string
  accountType: string
  quantity: number
  value: { toString: () => string }
  status: string
  createdAt: string
  client: { user: { name: string | null; email: string } }
  seller: { name: string | null } | null
}

function ReputationBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return null
  const badge = score >= 80 ? 'VIP' : score >= 50 ? 'Regular' : 'High Risk'
  const style =
    badge === 'VIP'
      ? 'bg-emerald-100 text-emerald-800'
      : badge === 'Regular'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-red-100 text-red-800'
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${style}`}>
      {badge === 'VIP' ? '🟢 VIP' : badge === 'Regular' ? '🟡 Regular' : '🔴 High Risk'}
    </span>
  )
}

function ClientLTVCard({ ltv, loading }: { ltv: ClientLTV | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
        <div className="h-12 bg-gray-100 rounded" />
      </div>
    )
  }
  if (!ltv) return null

  const { client, orders, accountsDelivered } = ltv
  const lastPurchase = client.lastPurchaseAt
    ? new Date(client.lastPurchaseAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'

  const rep = ltv.reputation
  const score = rep?.score ?? null
  const isHighRisk = score != null && score < 50

  return (
    <div className="p-4 bg-[#F8FAFC] rounded-lg border border-primary-600/10">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-[#1F2937] text-sm">
          Dados do cliente para LTV
        </h3>
        {score != null && (
          <span className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Score:</span>
            <ReputationBadge score={score} />
            <span className="text-gray-600">({score}/100)</span>
          </span>
        )}
      </div>
      {isHighRisk && (
        <div className="mb-3 p-2 rounded bg-red-50 border border-red-200 text-red-800 text-sm">
          ⚠️ Venda de contas G2 Premium bloqueada para este cliente (High Risk)
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <span className="text-gray-500 block">Última compra</span>
          <span className="font-medium">{lastPurchase}</span>
        </div>
        <div>
          <span className="text-gray-500 block">Total gasto</span>
          <span className="font-medium text-primary-600">
            R$ {client.totalSpent.toLocaleString('pt-BR')}
          </span>
        </div>
        <div>
          <span className="text-gray-500 block">Contas compradas</span>
          <span className="font-medium">{client.totalAccountsBought}</span>
        </div>
        <div>
          <span className="text-gray-500 block">Pedidos</span>
          <span className="font-medium">{client.ordersCount}</span>
        </div>
      </div>
      {accountsDelivered.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-500 mb-2">
            Contas/IDs entregues ({accountsDelivered.length})
          </p>
          <div className="max-h-24 overflow-y-auto space-y-1 text-xs">
            {accountsDelivered.slice(0, 10).map((a) => (
              <div key={a.id} className="flex gap-2 flex-wrap">
                <span className="font-mono text-primary-600">{a.id.slice(0, 8)}</span>
                <span className="text-gray-600">
                  {a.platform} — {a.email || a.cnpj || '—'}
                </span>
              </div>
            ))}
            {accountsDelivered.length > 10 && (
              <p className="text-gray-400">+{accountsDelivered.length - 10} outras</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const STATUS_LABELS: Record<string, string> = {
  QUOTE: 'Cotação',
  AWAITING_PAYMENT: 'Aguard. pagamento',
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  PAID: 'Pago',
  IN_SEPARATION: 'Em separação',
  IN_DELIVERY: 'Em entrega',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
}

export function VendasClient() {
  const [orders, setOrders] = useState<Order[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [kpis, setKpis] = useState({ revenue: 0, pending: 0, completed: 0 })
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [form, setForm] = useState({
    clientId: '',
    country: '',
    product: '',
    accountType: '',
    quantity: 1,
    value: 0,
  })
  const [submitting, setSubmitting] = useState(false)
  const [clientLtv, setClientLtv] = useState<ClientLTV | null>(null)
  const [ltvLoading, setLtvLoading] = useState(false)

  async function loadOrders() {
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    const res = await fetch(`/api/vendas?${params}`)
    const data = await res.json()
    if (res.ok) {
      setOrders(data.orders)
      setKpis(data.kpis)
    }
  }

  async function loadClients() {
    const res = await fetch('/api/clientes')
    const data = await res.json()
    if (res.ok) setClients(data)
  }

  useEffect(() => {
    if (!form.clientId) {
      setClientLtv(null)
      return
    }
    setLtvLoading(true)
    fetch(`/api/clientes/${form.clientId}/ltv`)
      .then((r) => r.json())
      .then((d) => setClientLtv(d))
      .catch(() => setClientLtv(null))
      .finally(() => setLtvLoading(false))
  }, [form.clientId])

  useEffect(() => {
    setLoading(true)
    loadOrders()
    loadClients()
    setLoading(false)
  }, [filterStatus])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const res = await fetch('/api/vendas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        clientId: form.clientId,
        quantity: Number(form.quantity),
        value: Number(form.value),
        country: form.country || undefined,
      }),
    })
    if (res.ok) {
      setForm({ clientId: '', country: '', product: '', accountType: '', quantity: 1, value: 0 })
      setShowForm(false)
      loadOrders()
    } else {
      const err = await res.json()
      alert(err.error || 'Erro ao registrar')
    }
    setSubmitting(false)
  }

  return (
    <div>
      <h1 className="heading-1 mb-6">
        Vendas
      </h1>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card">
          <p className="text-sm text-gray-500">Receita Total</p>
          <p className="text-2xl font-bold">
            {loading ? '—' : `R$ ${kpis.revenue.toLocaleString('pt-BR')}`}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Pedidos Pendentes</p>
          <p className="text-2xl font-bold">{loading ? '—' : kpis.pending}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Pedidos Concluídos</p>
          <p className="text-2xl font-bold">{loading ? '—' : kpis.completed}</p>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          <h2 className="font-semibold">Tabela de Vendas</h2>
          <div className="flex gap-2 items-center">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input-field py-1.5 px-2 w-40 text-sm"
            >
              <option value="">Todos status</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <button onClick={() => setShowForm(!showForm)} className="btn-primary">
              {showForm ? 'Cancelar' : 'Registrar Venda'}
            </button>
          </div>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-3 border border-primary-600/5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Cliente *</label>
                <select
                  value={form.clientId}
                  onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                  className="input-field"
                  required
                >
                  <option value="">Selecione...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.user.name || c.user.email}
                    </option>
                  ))}
                </select>
              </div>
              {form.clientId && (
                <div className="md:col-span-2 lg:col-span-3">
                  <ClientLTVCard ltv={clientLtv} loading={ltvLoading} />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">País</label>
                <input
                  type="text"
                  value={form.country}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                  className="input-field"
                  placeholder="Brasil"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Produto *</label>
                <input
                  type="text"
                  value={form.product}
                  onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
                  className="input-field"
                  placeholder="Conta Google Ads"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tipo de conta *</label>
                <input
                  type="text"
                  value={form.accountType}
                  onChange={(e) => setForm((f) => ({ ...f, accountType: e.target.value }))}
                  className="input-field"
                  placeholder="Ads USD"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Quantidade *</label>
                <input
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) || 1 }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Valor (R$) *</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.value || ''}
                  onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) || 0 }))}
                  className="input-field"
                  required
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? 'Salvando...' : 'Salvar'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                Cancelar
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          {loading ? (
            <p className="text-gray-500 py-4">Carregando...</p>
          ) : orders.length === 0 ? (
            <p className="text-gray-400 py-4">Nenhum pedido ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">ID</th>
                  <th className="pb-2 pr-4">Cliente</th>
                  <th className="pb-2 pr-4">Produto</th>
                  <th className="pb-2 pr-4">Qtd</th>
                  <th className="pb-2 pr-4">Valor</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Vendedor</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4 font-mono text-xs">{o.id.slice(0, 8)}</td>
                    <td className="py-3 pr-4">{o.client.user.name || o.client.user.email}</td>
                    <td className="py-3 pr-4">{o.product} ({o.accountType})</td>
                    <td className="py-3 pr-4">{o.quantity}</td>
                    <td className="py-3 pr-4">R$ {Number(o.value).toLocaleString('pt-BR')}</td>
                    <td className="py-3 pr-4">
                      <span className="px-2 py-0.5 rounded text-xs bg-gray-100">
                        {STATUS_LABELS[o.status] || o.status}
                      </span>
                    </td>
                    <td className="py-3">{o.seller?.name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
