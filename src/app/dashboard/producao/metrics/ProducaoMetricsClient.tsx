'use client'

import { useState, useEffect } from 'react'

const REJECTION_CODES = [
  { value: 'DOC_INVALIDO', label: 'Documento inválido' },
  { value: 'EMAIL_BLOQUEADO', label: 'E-mail bloqueado' },
  { value: 'CNPJ_INVALIDO', label: 'CNPJ inválido' },
  { value: 'PAGAMENTO_RECUSADO', label: 'Pagamento recusado' },
  { value: 'DADOS_INCONSISTENTES', label: 'Dados inconsistentes' },
  { value: 'OUTRO', label: 'Outro' },
]

type Metrics = {
  periodo: { start: string; end: string }
  total: number
  aprovadas: number
  reprovadas: number
  taxaSucesso: number
  porMotivo: Array<{ motivo: string; quantidade: number }>
  daily: Array<{ data: string; total: number }>
}

export function ProducaoMetricsClient({ isAdmin = false }: { isAdmin?: boolean }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('month')
  const [producerId, setProducerId] = useState('')
  const [producers, setProducers] = useState<Array<{ id: string; name: string | null }>>([])

  function load() {
    setLoading(true)
    const params = new URLSearchParams({ period })
    if (isAdmin && producerId) params.set('producerId', producerId)
    fetch(`/api/producao/metrics?${params}`)
      .then((r) => r.json())
      .then(setMetrics)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [period, producerId])

  useEffect(() => {
    if (isAdmin) {
      fetch('/api/admin/producers')
        .then((r) => r.json())
        .then((d) => setProducers(d.users || []))
        .catch(() => setProducers([]))
    }
  }, [isAdmin])

  if (loading && !metrics) return <p className="text-gray-500 py-4">Carregando métricas...</p>

  const m = metrics || {
    total: 0,
    aprovadas: 0,
    reprovadas: 0,
    taxaSucesso: 0,
    porMotivo: [],
    daily: [],
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-center">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="input-field w-40"
        >
          <option value="day">Hoje</option>
          <option value="week">Últimos 7 dias</option>
          <option value="month">Mês atual</option>
          <option value="year">Ano atual</option>
        </select>
        {isAdmin && producers.length > 0 && (
          <select
            value={producerId}
            onChange={(e) => setProducerId(e.target.value)}
            className="input-field w-48"
          >
            <option value="">Todos os produtores</option>
            {producers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.id}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-gray-500">Total criadas</p>
          <p className="text-2xl font-bold text-primary-600">{m.total}</p>
        </div>
        <div className="card border-l-4 border-l-green-500">
          <p className="text-sm text-gray-500">Aprovadas</p>
          <p className="text-2xl font-bold text-green-600">{m.aprovadas}</p>
        </div>
        <div className="card border-l-4 border-l-red-500">
          <p className="text-sm text-gray-500">Reprovadas</p>
          <p className="text-2xl font-bold text-red-600">{m.reprovadas}</p>
        </div>
        <div className="card border-l-4 border-l-blue-500">
          <p className="text-sm text-gray-500">Taxa de sucesso</p>
          <p className="text-2xl font-bold text-blue-600">{m.taxaSucesso}%</p>
        </div>
      </div>

      {m.porMotivo.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-4">Reprovadas por motivo</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">Motivo</th>
                  <th className="pb-2 text-right">Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {m.porMotivo.map((row) => (
                  <tr key={row.motivo} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-4">
                      {REJECTION_CODES.find((c) => c.value === row.motivo)?.label || row.motivo}
                    </td>
                    <td className="py-2 text-right font-medium">{row.quantidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {m.daily.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-4">Produção por dia</h3>
          <div className="flex flex-wrap gap-2">
            {m.daily.map((d) => (
              <div
                key={d.data}
                className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm"
              >
                <span className="text-gray-600">{new Date(d.data).toLocaleDateString('pt-BR')}</span>
                <span className="ml-2 font-medium">{d.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export { REJECTION_CODES }
