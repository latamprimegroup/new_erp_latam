'use client'

import { useState, useEffect } from 'react'

type Kpis = {
  users: number
  productionDaily: number
  productionMonthly: number
  stockCritical: number
  ordersPending: number
  ordersCompleted: number
  deliveriesDelayed: number
  financialIncome: number
  financialExpense: number
  financialBalance: number
}

type Log = {
  id: string
  action: string
  entity: string
  entityId: string | null
  createdAt: string
  user: { name: string | null; email: string } | null
}

type Alert = {
  type: string
  message: string
}

export function AdminClient() {
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch('/api/admin/dashboard')
      .then((r) => r.json())
      .then((data) => {
        setKpis(data.kpis || null)
        setAlerts(data.alerts || [])
        setLogs(data.logs || [])
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <p className="text-gray-500 py-8">Carregando...</p>
  }

  return (
    <div>
      <h1 className="heading-1 mb-6">
        Admin / Auditoria
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <p className="text-sm text-gray-500">Produção x Meta</p>
          <p className="text-2xl font-bold">{kpis?.productionDaily ?? '—'}</p>
          <p className="text-xs text-gray-400">hoje / {kpis?.productionMonthly ?? 0} mensal</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Estoque Crítico</p>
          <p className={`text-2xl font-bold ${(kpis?.stockCritical ?? 0) > 0 ? 'text-red-600' : ''}`}>
            {kpis?.stockCritical ?? '—'}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Entregas Atrasadas</p>
          <p className={`text-2xl font-bold ${(kpis?.deliveriesDelayed ?? 0) > 0 ? 'text-amber-600' : ''}`}>
            {kpis?.deliveriesDelayed ?? '—'}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Financeiro (mês)</p>
          <p className={`text-2xl font-bold ${(kpis?.financialBalance ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            R$ {(kpis?.financialBalance ?? 0).toLocaleString('pt-BR')}
          </p>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="card mb-6">
          <h2 className="font-semibold mb-4">Alertas</h2>
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li
                key={`${a.type}-${i}`}
                className={`px-3 py-2 rounded text-sm ${
                  a.type === 'critical' ? 'bg-red-100 text-red-800' :
                  a.type === 'warning' ? 'bg-amber-100 text-amber-800' :
                  'bg-blue-100 text-blue-800'
                }`}
              >
                {a.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card mb-6">
        <h2 className="font-semibold mb-4">Resumo Geral</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Usuários:</span>
            <span className="ml-2 font-medium">{kpis?.users ?? 0}</span>
          </div>
          <div>
            <span className="text-gray-500">Pedidos pendentes:</span>
            <span className="ml-2 font-medium">{kpis?.ordersPending ?? 0}</span>
          </div>
          <div>
            <span className="text-gray-500">Pedidos concluídos:</span>
            <span className="ml-2 font-medium">{kpis?.ordersCompleted ?? 0}</span>
          </div>
          <div>
            <span className="text-gray-500">Receita mês:</span>
            <span className="ml-2 font-medium text-green-600">
              R$ {(kpis?.financialIncome ?? 0).toLocaleString('pt-BR')}
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">Logs de Ação</h2>
          <a
            href="/api/admin/auditoria?format=csv"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-sm"
          >
            Exportar CSV
          </a>
        </div>
        {logs.length === 0 ? (
          <p className="text-gray-400 py-4">Nenhum log de auditoria registrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">Data</th>
                  <th className="pb-2 pr-4">Usuário</th>
                  <th className="pb-2 pr-4">Ação</th>
                  <th className="pb-2">Entidade</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4">{new Date(l.createdAt).toLocaleString('pt-BR')}</td>
                    <td className="py-3 pr-4">{l.user?.name || l.user?.email || '—'}</td>
                    <td className="py-3 pr-4">{l.action}</td>
                    <td className="py-3">{l.entity} {l.entityId ? `#${l.entityId.slice(0, 8)}` : ''}</td>
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
