'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Solicitation = {
  id: string
  quantity: number
  product: string
  accountType: string
  country: string | null
  referenceOrderId: string | null
  status: string
  createdAt: string
  client: { user: { name: string | null; email: string } }
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
}

export default function AdminSolicitacoesPage() {
  const [solicitations, setSolicitations] = useState<Solicitation[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [updating, setUpdating] = useState<string | null>(null)

  function load() {
    const params = filterStatus ? `?status=${filterStatus}` : ''
    fetch(`/api/admin/solicitacoes${params}`)
      .then((r) => r.json())
      .then(setSolicitations)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setLoading(true)
    load()
  }, [filterStatus])

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

  return (
    <div>
      <div className="flex gap-4 items-center mb-6">
        <Link href="/dashboard/admin" className="text-gray-500 hover:text-gray-700">← Admin</Link>
        <h1 className="heading-1">Solicitações de Novas Contas</h1>
      </div>

      <div className="card">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          <h2 className="font-semibold">Solicitações de clientes</h2>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field py-1.5 px-2 w-40 text-sm"
          >
            <option value="">Todos</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
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
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">Data</th>
                  <th className="pb-2 pr-4">Cliente</th>
                  <th className="pb-2 pr-4">Quantidade</th>
                  <th className="pb-2 pr-4">Produto / Tipo</th>
                  <th className="pb-2 pr-4">Base</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {solicitations.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4">{new Date(s.createdAt).toLocaleString('pt-BR')}</td>
                    <td className="py-3 pr-4">{s.client.user.name || s.client.user.email}</td>
                    <td className="py-3 pr-4 font-medium">{s.quantity}</td>
                    <td className="py-3 pr-4">{s.product} ({s.accountType})</td>
                    <td className="py-3 pr-4">{s.referenceOrderId ? 'Última compra' : '—'}</td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        s.status === 'completed' ? 'bg-green-100 text-green-800' :
                        s.status === 'in_progress' ? 'bg-amber-100 text-amber-800' :
                        s.status === 'cancelled' ? 'bg-gray-100 text-gray-600' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {STATUS_LABELS[s.status]}
                      </span>
                    </td>
                    <td className="py-3">
                      {s.status === 'pending' && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleUpdateStatus(s.id, 'in_progress')}
                            disabled={!!updating}
                            className="text-xs text-amber-600 hover:underline"
                          >
                            Em andamento
                          </button>
                          <span>|</span>
                          <button
                            onClick={() => handleUpdateStatus(s.id, 'completed')}
                            disabled={!!updating}
                            className="text-xs text-green-600 hover:underline"
                          >
                            Concluir
                          </button>
                        </div>
                      )}
                      {s.status === 'in_progress' && (
                        <button
                          onClick={() => handleUpdateStatus(s.id, 'completed')}
                          disabled={!!updating}
                          className="text-xs text-green-600 hover:underline"
                        >
                          Concluir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
