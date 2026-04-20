'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  PROCESSING: 'Processando',
  COMPLETED: 'Pago',
  HELD: 'Retido',
  FAILED: 'Rejeitado',
}

type Withdrawal = {
  id: string
  gateway: string
  accountId: string | null
  value: { toString: () => string }
  fee: { toString: () => string } | null
  netValue: { toString: () => string }
  status: string
  dueDate: string | null
  risk: string | null
  createdAt: string
  user?: { id: string; name: string | null; email: string } | null
}

export function SaquesClient() {
  const searchParams = useSearchParams()
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [alerts, setAlerts] = useState({ pending: 0, held: 0 })
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [form, setForm] = useState({
    gateway: '',
    accountId: '',
    value: 0,
    fee: 0,
    netValue: 0,
    dueDate: '',
    risk: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)
  const initFromUrlDone = useRef(false)
  const [filterReady, setFilterReady] = useState(false)

  async function handleUpdateStatus(id: string, status: string) {
    setUpdating(id)
    try {
      const res = await fetch('/api/saques', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (res.ok) {
        setWithdrawals((prev) => prev.map((w) => (w.id === id ? { ...w, status } : w)))
        setAlerts((a) => ({ ...a, pending: status === 'PENDING' ? a.pending : Math.max(0, a.pending - 1) }))
      }
    } finally {
      setUpdating(null)
    }
  }

  useEffect(() => {
    if (initFromUrlDone.current) return
    initFromUrlDone.current = true
    if (searchParams.get('pendentes') === '1') setFilterStatus('PENDING')
    setFilterReady(true)
  }, [searchParams])

  useEffect(() => {
    if (!filterReady) return
    setLoading(true)
    const params = filterStatus ? `?status=${filterStatus}` : ''
    fetch(`/api/saques${params}`)
      .then((r) => r.json())
      .then((data) => {
        setWithdrawals(data.withdrawals || [])
        setAlerts(data.alerts || { pending: 0, held: 0 })
      })
      .finally(() => setLoading(false))
  }, [filterReady, filterStatus])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const res = await fetch('/api/saques', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        accountId: form.accountId || undefined,
        fee: form.fee || undefined,
        netValue: form.netValue || form.value,
        dueDate: form.dueDate || undefined,
        risk: form.risk || undefined,
      }),
    })
    if (res.ok) {
      setForm({ gateway: '', accountId: '', value: 0, fee: 0, netValue: 0, dueDate: '', risk: '' })
      setShowForm(false)
      setLoading(true)
      fetch(`/api/saques`)
        .then((r) => r.json())
        .then((data) => {
          setWithdrawals(data.withdrawals || [])
          setAlerts(data.alerts || { pending: 0, held: 0 })
        })
        .finally(() => setLoading(false))
    } else {
      const err = await res.json()
      alert(err.error || 'Erro ao registrar')
    }
    setSubmitting(false)
  }

  return (
    <div>
      <h1 className="heading-1 mb-6">
        Saques
      </h1>

      {(alerts.pending > 0 || alerts.held > 0) && (
        <div className="card mb-6 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-800 font-medium">
            ⚠️ Alertas:
            {alerts.pending > 0 && ` ${alerts.pending} saque(s) pendente(s)`}
            {alerts.held > 0 && ` • ${alerts.held} saque(s) retido(s)`}
          </p>
        </div>
      )}

      <div className="card">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          <h2 className="font-semibold">Tabela de Saques</h2>
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
              {showForm ? 'Cancelar' : 'Registrar Saque'}
            </button>
          </div>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-3 border border-primary-600/5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Gateway *</label>
                <input
                  type="text"
                  value={form.gateway}
                  onChange={(e) => setForm((f) => ({ ...f, gateway: e.target.value }))}
                  className="input-field"
                  placeholder="Ex: Banco Inter"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Conta (ID)</label>
                <input
                  type="text"
                  value={form.accountId}
                  onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                  className="input-field"
                  placeholder="Referência"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Valor (R$) *</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.value || ''}
                  onChange={(e) => {
                    const v = Number(e.target.value) || 0
                    setForm((f) => ({ ...f, value: v, netValue: v - (f.fee || 0) }))
                  }}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Taxa (R$)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.fee || ''}
                  onChange={(e) => {
                    const fee = Number(e.target.value) || 0
                    setForm((f) => ({ ...f, fee, netValue: f.value - fee }))
                  }}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Valor líquido (R$)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.netValue || ''}
                  onChange={(e) => setForm((f) => ({ ...f, netValue: Number(e.target.value) || 0 }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Prazo</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Risco</label>
                <input
                  type="text"
                  value={form.risk}
                  onChange={(e) => setForm((f) => ({ ...f, risk: e.target.value }))}
                  className="input-field"
                  placeholder="Baixo / Médio / Alto"
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
          ) : withdrawals.length === 0 ? (
            <p className="text-gray-400 py-4">Nenhum saque registrado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">Solicitante</th>
                  <th className="pb-2 pr-4">Gateway</th>
                  <th className="pb-2 pr-4">Chave PIX / Ref.</th>
                  <th className="pb-2 pr-4">Valor</th>
                  <th className="pb-2 pr-4">Data solicitação</th>
                  <th className="pb-2 pr-4">Taxa</th>
                  <th className="pb-2 pr-4">Líquido</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Prazo</th>
                  <th className="pb-2 pr-4">Risco</th>
                  <th className="pb-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4">
                      {w.user ? w.user.name || w.user.email : '—'}
                    </td>
                    <td className="py-3 pr-4">{w.gateway}</td>
                    <td className="py-3 pr-4 font-mono text-xs">{w.accountId || '—'}</td>
                    <td className="py-3 pr-4">R$ {Number(w.value).toLocaleString('pt-BR')}</td>
                    <td className="py-3 pr-4">{new Date(w.createdAt).toLocaleString('pt-BR')}</td>
                    <td className="py-3 pr-4">{w.fee ? `R$ ${Number(w.fee).toLocaleString()}` : '—'}</td>
                    <td className="py-3 pr-4">R$ {Number(w.netValue).toLocaleString('pt-BR')}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          w.status === 'PENDING' ? 'bg-amber-100 text-amber-800' :
                          w.status === 'HELD' ? 'bg-red-100 text-red-800' :
                          w.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100'
                        }`}
                      >
                        {STATUS_LABELS[w.status] || w.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">{w.dueDate ? new Date(w.dueDate).toLocaleDateString('pt-BR') : '—'}</td>
                    <td className="py-3 pr-4">{w.risk || '—'}</td>
                    <td className="py-3">
                      {w.status === 'PENDING' && (
                        <div className="flex gap-1 flex-wrap">
                          <button
                            onClick={() => handleUpdateStatus(w.id, 'PROCESSING')}
                            disabled={!!updating}
                            className="text-xs text-amber-600 hover:underline"
                          >
                            Aprovar
                          </button>
                          <span>|</span>
                          <button
                            onClick={() => handleUpdateStatus(w.id, 'COMPLETED')}
                            disabled={!!updating}
                            className="text-xs text-green-600 hover:underline"
                          >
                            Marcar pago
                          </button>
                          <span>|</span>
                          <button
                            onClick={() => handleUpdateStatus(w.id, 'FAILED')}
                            disabled={!!updating}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Negar
                          </button>
                        </div>
                      )}
                      {w.status === 'PROCESSING' && (
                        <button
                          onClick={() => handleUpdateStatus(w.id, 'COMPLETED')}
                          disabled={!!updating}
                          className="text-xs text-green-600 hover:underline"
                        >
                          Marcar pago
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
