'use client'

import { useState, useEffect } from 'react'

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  IN_PROGRESS: 'Em progresso',
  DELIVERED: 'Entregue',
  DELAYED: 'Atrasada',
}

type Delivery = {
  id: string
  qtySold: number
  qtyDelivered: number
  accountsDelivered: string | null
  status: string
  deliveredAt: string | null
  createdAt: string
  order: {
    id: string
    product: string
    quantity: number
    client: { user: { name: string | null; email: string } }
  }
  responsible: { name: string | null } | null
}

type Order = {
  id: string
  product: string
  quantity: number
  client: { user: { name: string | null; email: string } }
}

export function EntregasClient() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [pendingOrders, setPendingOrders] = useState<Order[]>([])
  const [kpis, setKpis] = useState({ pending: 0, delivered: 0 })
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [formOrderId, setFormOrderId] = useState('')
  const [formQtySold, setFormQtySold] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    setLoading(true)
    const params = filterStatus ? `?status=${filterStatus}` : ''
    const [delRes, ordRes] = await Promise.all([
      fetch(`/api/entregas${params}`),
      fetch('/api/pedidos'),
    ])
    const delData = await delRes.json()
    const ordData = await ordRes.json()
    if (delRes.ok) {
      setDeliveries(delData.deliveries || [])
      setKpis(delData.kpis || { pending: 0, delivered: 0 })
    }
    if (ordRes.ok) setPendingOrders(ordData.orders || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [filterStatus])

  async function handleCreateDelivery(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const res = await fetch('/api/entregas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: formOrderId, qtySold: formQtySold }),
    })
    if (res.ok) {
      setShowForm(false)
      setFormOrderId('')
      setFormQtySold(1)
      load()
    } else {
      const err = await res.json()
      alert(err.error || 'Erro ao registrar')
    }
    setSubmitting(false)
  }

  async function handleUpdateStatus(id: string, status: string) {
    const res = await fetch('/api/entregas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    if (res.ok) load()
  }

  return (
    <div>
      <h1 className="heading-1 mb-6">
        Entregas
      </h1>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card">
          <p className="text-sm text-gray-500">Entregas Pendentes</p>
          <p className="text-2xl font-bold">{loading ? '—' : kpis.pending}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Entregas Concluídas</p>
          <p className="text-2xl font-bold">{loading ? '—' : kpis.delivered}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Tempo Médio</p>
          <p className="text-2xl font-bold">—</p>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          <h2 className="font-semibold">Tabela de Entregas</h2>
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
              {showForm ? 'Cancelar' : 'Registrar Entrega'}
            </button>
          </div>
        </div>

        {showForm && (
          <form onSubmit={handleCreateDelivery} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-3 border border-primary-600/5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Pedido *</label>
                <select
                  value={formOrderId}
                  onChange={(e) => {
                    const ord = pendingOrders.find((o) => o.id === e.target.value)
                    setFormOrderId(e.target.value)
                    setFormQtySold(ord?.quantity || 1)
                  }}
                  className="input-field"
                  required
                >
                  <option value="">Selecione...</option>
                  {pendingOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.id.slice(0, 8)} — {o.client.user.name || o.client.user.email} — {o.product}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Qtd vendida</label>
                <input
                  type="number"
                  min={1}
                  value={formQtySold}
                  onChange={(e) => setFormQtySold(Number(e.target.value) || 1)}
                  className="input-field"
                />
              </div>
            </div>
            {pendingOrders.length === 0 && (
              <p className="text-sm text-amber-600">Nenhum pedido pendente sem entrega.</p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting || pendingOrders.length === 0}
                className="btn-primary"
              >
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
          ) : deliveries.length === 0 ? (
            <p className="text-gray-400 py-4">Nenhuma entrega registrada.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">Pedido</th>
                  <th className="pb-2 pr-4">Cliente</th>
                  <th className="pb-2 pr-4">Qtd Vendida</th>
                  <th className="pb-2 pr-4">Qtd Entregue</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Responsável</th>
                  <th className="pb-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4 font-mono text-xs">{d.order.id.slice(0, 8)}</td>
                    <td className="py-3 pr-4">{d.order.client.user.name || d.order.client.user.email}</td>
                    <td className="py-3 pr-4">{d.qtySold}</td>
                    <td className="py-3 pr-4">{d.qtyDelivered}</td>
                    <td className="py-3 pr-4">
                      <span className="px-2 py-0.5 rounded text-xs bg-gray-100">
                        {STATUS_LABELS[d.status] || d.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">{d.responsible?.name || '—'}</td>
                    <td className="py-3">
                      {d.status !== 'DELIVERED' && (
                        <button
                          onClick={() => handleUpdateStatus(d.id, 'DELIVERED')}
                          className="link-primary text-xs"
                        >
                          Marcar entregue
                        </button>
                      )}
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
