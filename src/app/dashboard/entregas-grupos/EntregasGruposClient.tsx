'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const STATUS_LABELS: Record<string, string> = {
  AGUARDANDO_INICIO: 'Aguardando início',
  EM_ANDAMENTO: 'Em andamento',
  PARCIALMENTE_ENTREGUE: 'Parcialmente entregue',
  FINALIZADA: 'Finalizada',
  ATRASADA: 'Atrasada',
  EM_REPOSICAO: 'Em reposição',
  CANCELADA: 'Cancelada',
}

const ACCOUNT_TYPE = { USD: 'USD', BRL: 'BRL' }
const PAYMENT_TYPE = { AUTOMATICO: 'Automático', MANUAL: 'Manual' }

type DeliveryGroup = {
  id: string
  groupNumber: string
  clientId: string
  whatsappGroupLink: string
  accountType: string
  quantityContracted: number
  quantityDelivered: number
  quantityPending: number
  currency: string
  paymentType: string
  status: string
  expectedCompletionAt: string | null
  groupCreatedAt: string
  saleDate: string | null
  client: { user: { name: string | null; email: string } }
  responsible: { name: string | null }
}

export function EntregasGruposClient() {
  const [items, setItems] = useState<DeliveryGroup[]>([])
  const [kpis, setKpis] = useState({
    totalMonth: 0,
    totalAccountsDelivered: 0,
    pending: 0,
    late: 0,
    repositionsOpen: 0,
    completionPercent: 0,
  })
  const [clients, setClients] = useState<{ id: string; clientCode: string | null; user: { name: string | null; email: string } }[]>([])
  const [orders, setOrders] = useState<{ id: string; product: string; quantity: number; clientId: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filters, setFilters] = useState({
    clientId: '',
    status: '',
    accountType: '',
    paymentType: '',
    periodStart: '',
    periodEnd: '',
  })
  const [form, setForm] = useState({
    clientId: '',
    orderId: '',
    whatsappGroupLink: '',
    accountType: 'BRL' as string,
    quantityContracted: 1,
    currency: 'BRL',
    paymentType: 'MANUAL' as string,
    estimatedTimeHours: '',
    saleDate: '',
  })
  const [submitting, setSubmitting] = useState(false)

  function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.clientId) params.set('clientId', filters.clientId)
    if (filters.status) params.set('status', filters.status)
    if (filters.accountType) params.set('accountType', filters.accountType)
    if (filters.paymentType) params.set('paymentType', filters.paymentType)
    if (filters.periodStart) params.set('periodStart', filters.periodStart)
    if (filters.periodEnd) params.set('periodEnd', filters.periodEnd)
    params.set('page', '1')
    params.set('limit', '50')

    Promise.all([
      fetch(`/api/entregas-grupos?${params}`),
      fetch('/api/clientes'),
      fetch('/api/vendas?status=PAID&limit=100'),
    ])
      .then(async ([r1, r2, r3]) => {
        const d1 = await r1.json()
        const d2 = await r2.json()
        const d3 = await r3.json()
        if (r1.ok) {
          setItems(d1.items || [])
          setKpis(d1.kpis || kpis)
        }
        if (r2.ok) setClients(Array.isArray(d2) ? d2 : (d2.clients ?? []))
        if (r3.ok) setOrders(d3.orders || d3.items || [])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [filters.clientId, filters.status, filters.accountType, filters.paymentType, filters.periodStart, filters.periodEnd])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const res = await fetch('/api/entregas-grupos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        quantityContracted: Number(form.quantityContracted),
        estimatedTimeHours: form.estimatedTimeHours ? Number(form.estimatedTimeHours) : undefined,
        saleDate: form.saleDate || undefined,
        orderId: form.orderId || undefined,
      }),
    })
    if (res.ok) {
      setShowForm(false)
      setForm({
        clientId: '',
        orderId: '',
        whatsappGroupLink: '',
        accountType: 'BRL',
        quantityContracted: 1,
        currency: 'BRL',
        paymentType: 'MANUAL',
        estimatedTimeHours: '',
        saleDate: '',
      })
      load()
    } else {
      const err = await res.json()
      alert(err.error || 'Erro ao criar entrega')
    }
    setSubmitting(false)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="heading-1">Entregas por Grupo</h1>
        <Link
          href="/dashboard/entregas"
          className="text-sm text-gray-500 hover:text-primary-600"
        >
          Ver entregas por pedido
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        <div className="card">
          <p className="text-sm text-gray-500">Entregas do mês</p>
          <p className="text-2xl font-bold">{kpis.totalMonth}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Contas entregues</p>
          <p className="text-2xl font-bold text-green-600">{kpis.totalAccountsDelivered}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Pendentes</p>
          <p className="text-2xl font-bold text-amber-600">{kpis.pending}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Atrasadas</p>
          <p className={`text-2xl font-bold ${kpis.late > 0 ? 'text-red-600' : ''}`}>{kpis.late}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Reposições abertas</p>
          <p className="text-2xl font-bold">{kpis.repositionsOpen}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">% conclusão</p>
          <p className="text-2xl font-bold">{kpis.completionPercent}%</p>
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex flex-wrap justify-between gap-4 mb-4">
          <div className="flex flex-wrap gap-2">
            <select
              value={filters.clientId}
              onChange={(e) => setFilters((f) => ({ ...f, clientId: e.target.value }))}
              className="input-field py-1.5 text-sm w-40"
            >
              <option value="">Todos clientes</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.clientCode || c.user.email}
                </option>
              ))}
            </select>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="input-field py-1.5 text-sm w-44"
            >
              <option value="">Todos status</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={filters.accountType}
              onChange={(e) => setFilters((f) => ({ ...f, accountType: e.target.value }))}
              className="input-field py-1.5 text-sm w-24"
            >
              <option value="">Tipo</option>
              <option value="USD">USD</option>
              <option value="BRL">BRL</option>
            </select>
            <select
              value={filters.paymentType}
              onChange={(e) => setFilters((f) => ({ ...f, paymentType: e.target.value }))}
              className="input-field py-1.5 text-sm w-32"
            >
              <option value="">Pagamento</option>
              <option value="AUTOMATICO">Automático</option>
              <option value="MANUAL">Manual</option>
            </select>
            <input
              type="date"
              value={filters.periodStart}
              onChange={(e) => setFilters((f) => ({ ...f, periodStart: e.target.value }))}
              className="input-field py-1.5 text-sm w-36"
            />
            <input
              type="date"
              value={filters.periodEnd}
              onChange={(e) => setFilters((f) => ({ ...f, periodEnd: e.target.value }))}
              className="input-field py-1.5 text-sm w-36"
            />
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            {showForm ? 'Cancelar' : 'Nova Entrega'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-3 border">
            <h3 className="font-semibold">Nova entrega</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Cliente *</label>
                <select
                  value={form.clientId}
                  onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                  className="input-field"
                  required
                >
                  <option value="">Selecione</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.clientCode || c.user.email} - {c.user.name || ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Pedido (opcional)</label>
                <select
                  value={form.orderId}
                  onChange={(e) => setForm((f) => ({ ...f, orderId: e.target.value }))}
                  className="input-field"
                >
                  <option value="">Nenhum</option>
                  {orders.filter((o) => !form.clientId || o.clientId === form.clientId).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.product} - {o.quantity} un
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Link grupo WhatsApp *</label>
                <input
                  type="text"
                  value={form.whatsappGroupLink}
                  onChange={(e) => setForm((f) => ({ ...f, whatsappGroupLink: e.target.value }))}
                  className="input-field"
                  placeholder="https://chat.whatsapp.com/..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tipo conta *</label>
                <select
                  value={form.accountType}
                  onChange={(e) => setForm((f) => ({ ...f, accountType: e.target.value }))}
                  className="input-field"
                >
                  <option value="USD">USD</option>
                  <option value="BRL">BRL</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Quantidade contratada *</label>
                <input
                  type="number"
                  min={1}
                  value={form.quantityContracted}
                  onChange={(e) => setForm((f) => ({ ...f, quantityContracted: Number(e.target.value) || 1 }))}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Pagamento *</label>
                <select
                  value={form.paymentType}
                  onChange={(e) => setForm((f) => ({ ...f, paymentType: e.target.value }))}
                  className="input-field"
                >
                  <option value="AUTOMATICO">Automático</option>
                  <option value="MANUAL">Manual</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Prazo estimado (horas)</label>
                <input
                  type="number"
                  min={1}
                  value={form.estimatedTimeHours}
                  onChange={(e) => setForm((f) => ({ ...f, estimatedTimeHours: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Data da venda</label>
                <input
                  type="date"
                  value={form.saleDate}
                  onChange={(e) => setForm((f) => ({ ...f, saleDate: e.target.value }))}
                  className="input-field"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? 'Salvando...' : 'Criar entrega'}
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
          ) : items.length === 0 ? (
            <p className="text-gray-500 py-4">Nenhuma entrega encontrada.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">Código</th>
                  <th className="pb-2 pr-4">Cliente</th>
                  <th className="pb-2 pr-4">Grupo</th>
                  <th className="pb-2 pr-4">Tipo</th>
                  <th className="pb-2 pr-4">Qtd</th>
                  <th className="pb-2 pr-4">Entregue</th>
                  <th className="pb-2 pr-4">Pendente</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Prazo</th>
                  <th className="pb-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4 font-mono">{d.groupNumber}</td>
                    <td className="py-3 pr-4">{d.client.user.name || d.client.user.email}</td>
                    <td className="py-3 pr-4">
                      <a
                        href={d.whatsappGroupLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:underline truncate max-w-[120px] block"
                      >
                        {d.whatsappGroupLink.slice(0, 30)}...
                      </a>
                    </td>
                    <td className="py-3 pr-4">{d.accountType}</td>
                    <td className="py-3 pr-4">{d.quantityContracted}</td>
                    <td className="py-3 pr-4 text-green-600">{d.quantityDelivered}</td>
                    <td className="py-3 pr-4 text-amber-600">{d.quantityPending}</td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        d.status === 'FINALIZADA' ? 'bg-green-100 text-green-800' :
                        d.status === 'ATRASADA' ? 'bg-red-100 text-red-800' :
                        d.status === 'EM_REPOSICAO' ? 'bg-amber-100 text-amber-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {STATUS_LABELS[d.status] || d.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {d.expectedCompletionAt
                        ? new Date(d.expectedCompletionAt).toLocaleDateString('pt-BR')
                        : '—'}
                    </td>
                    <td className="py-3">
                      <Link
                        href={`/dashboard/entregas-grupos/${d.id}`}
                        className="text-primary-600 hover:underline"
                      >
                        Ver
                      </Link>
                    </td>
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
