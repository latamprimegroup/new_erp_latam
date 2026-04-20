'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Resumo = {
  emAndamento: number
  concluidas: number
  atrasadas: number
  reposicoes: number
  devolucoes: number
  receitaPendente: number
  receitaEmRisco: number
  percentualMedioConclusao: number
  tempoMedioEntregaDias: number
}

type DashboardData = {
  resumo: Resumo
  rankingPorSaldoPendente: Array<{
    id: string
    groupNumber: string
    clientName: string | null
    receitaPendente: number
    percentualConclusao: number
  }>
  rankingPorPrioridade: Array<{
    id: string
    groupNumber: string
    clientName: string | null
    priorityScore: number
  }>
  alertas: Array<{ type: string; message: string; groupId?: string }>
}

export function DeliveryDashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/delivery-dashboard')
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading || !data) {
    return (
      <div>
        <h1 className="text-xl font-semibold mb-4">Dashboard de Entregas</h1>
        <p className="text-gray-500">Carregando...</p>
      </div>
    )
  }

  const { resumo, rankingPorSaldoPendente, rankingPorPrioridade, alertas } = data

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Dashboard Estratégico de Entregas</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <Card label="Em andamento" value={resumo.emAndamento} />
        <Card label="Concluídas" value={resumo.concluidas} />
        <Card label="Atrasadas" value={resumo.atrasadas} />
        <Card label="Reposições abertas" value={resumo.reposicoes} />
        <Card label="Devoluções" value={resumo.devolucoes} />
        <Card
          label="% conclusão médio"
          value={`${resumo.percentualMedioConclusao}%`}
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card
          label="Receita pendente"
          value={`R$ ${resumo.receitaPendente.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`}
        />
        <Card
          label="Receita em risco"
          value={`R$ ${resumo.receitaEmRisco.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`}
        />
        <Card
          label="Tempo médio entrega"
          value={`${resumo.tempoMedioEntregaDias} dias`}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="border rounded-lg p-4">
          <h2 className="font-medium mb-3">Ranking por saldo pendente</h2>
          <ul className="space-y-2 text-sm">
            {rankingPorSaldoPendente.slice(0, 8).map((r, i) => (
              <li key={i} className="flex justify-between">
                <Link href={`/dashboard/entregas-grupos/${r.id}`} className="text-blue-600 hover:underline">
                  {r.groupNumber}
                </Link>
                <span>
                  {r.clientName ?? '—'} · R$ {(r.receitaPendente ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                </span>
              </li>
            ))}
            {rankingPorSaldoPendente.length === 0 && <li className="text-gray-500">Nenhuma pendência</li>}
          </ul>
        </div>
        <div className="border rounded-lg p-4">
          <h2 className="font-medium mb-3">Ranking por prioridade</h2>
          <ul className="space-y-2 text-sm">
            {rankingPorPrioridade.slice(0, 8).map((r, i) => (
              <li key={i} className="flex justify-between">
                <Link href={`/dashboard/entregas-grupos/${r.id}`} className="text-blue-600 hover:underline">
                  {r.groupNumber}
                </Link>
                <span>
                  {r.clientName ?? '—'} · Score {r.priorityScore}
                </span>
              </li>
            ))}
            {rankingPorPrioridade.length === 0 && <li className="text-gray-500">Nenhuma entrega ativa</li>}
          </ul>
        </div>
      </div>

      {alertas.length > 0 && (
        <div className="border border-amber-200 rounded-lg p-4 bg-amber-50">
          <h2 className="font-medium text-amber-800 mb-3">Alertas ativos</h2>
          <ul className="space-y-1 text-sm text-amber-900">
            {alertas.map((a, i) => (
              <li key={i}>{a.message}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 text-sm text-gray-500">
        <Link href="/dashboard/entregas-grupos" className="text-blue-600 hover:underline">
          Ver grupos de entrega
        </Link>
        {' · '}
        <Link href="/dashboard/entregas-grupos?orderBy=priority" className="text-blue-600 hover:underline">
          Ordenar por prioridade
        </Link>
      </p>
    </div>
  )
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  )
}
