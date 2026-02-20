'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

function MetasDinamicasCard() {
  const [metas, setMetas] = useState<{
    producao?: { metaAtual: number; sugerida: number }
    vendas?: { mediaMensal: number; sugerida: number }
  } | null>(null)
  useEffect(() => {
    fetch('/api/admin/metas-dinamicas')
      .then((r) => r.json())
      .then(setMetas)
      .catch(() => {})
  }, [])
  if (!metas?.producao) return null
  return (
    <div className="card">
      <h2 className="font-semibold text-slate-800 mb-4">Metas sugeridas (histórico + 5%)</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-gray-500">Produção atual</p>
          <p className="font-medium">{metas.producao.metaAtual}</p>
        </div>
        <div>
          <p className="text-gray-500">Produção sugerida</p>
          <p className="font-medium text-primary-600">{metas.producao.sugerida}</p>
        </div>
        <div>
          <p className="text-gray-500">Vendas média 3m</p>
          <p className="font-medium">R$ {metas.vendas?.mediaMensal?.toLocaleString('pt-BR') ?? '—'}</p>
        </div>
        <div>
          <p className="text-gray-500">Vendas sugerida</p>
          <p className="font-medium text-primary-600">R$ {metas.vendas?.sugerida?.toLocaleString('pt-BR') ?? '—'}</p>
        </div>
      </div>
    </div>
  )
}

type CeoData = {
  receitaAtual: number
  receitaMes: number
  receitaProjetada: number
  ltvMedio: number
  churnAltoRisco: number
  margemReal: number
  valorBase: number
  receitaEmRisco: number
  valuation: { conservador: number; moderado: number; agressivo: number } | null
  indiceSaude: number
  classificacaoRisco: string
  producaoMes: number
}

const RISCO_COLOR: Record<string, string> = {
  SAUDAVEL: 'text-green-600',
  ATENCAO: 'text-amber-600',
  RISCO: 'text-orange-600',
  CRITICO: 'text-red-600',
}

export function CeoDashboardClient() {
  const [data, setData] = useState<CeoData | null>(null)
  const [loading, setLoading] = useState(true)

  function load() {
    setLoading(true)
    fetch('/api/admin/ceo-dashboard')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleSync() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/bi-metrics/sync', { method: 'POST' })
      if (res.ok) load()
      else alert((await res.json()).error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !data) {
    return (
      <div>
        <h1 className="heading-1 mb-6">Centro de Comando CEO</h1>
        <p className="text-gray-500">Carregando...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap gap-4 items-center justify-between mb-6">
        <div className="flex gap-4 items-center">
          <Link href="/dashboard/admin" className="text-gray-500 hover:text-gray-700">← Admin</Link>
          <h1 className="heading-1">Centro de Comando CEO</h1>
        </div>
        <button onClick={handleSync} disabled={loading} className="btn-secondary text-sm">
          {loading ? '...' : 'Calcular métricas'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
        <div className="card">
          <p className="text-sm text-gray-500">Receita total</p>
          <p className="text-2xl font-bold text-primary-600">
            R$ {data.receitaAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Receita mês</p>
          <p className="text-2xl font-bold">
            R$ {data.receitaMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">LTV médio</p>
          <p className="text-2xl font-bold">
            R$ {data.ltvMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Churn alto risco</p>
          <p className={`text-2xl font-bold ${data.churnAltoRisco > 0 ? 'text-amber-600' : ''}`}>
            {data.churnAltoRisco}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Receita em risco</p>
          <p className={`text-2xl font-bold ${data.receitaEmRisco > 0 ? 'text-amber-600' : ''}`}>
            R$ {data.receitaEmRisco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Produção mês</p>
          <p className="text-2xl font-bold">{data.producaoMes}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="card">
          <h2 className="font-semibold text-slate-800 mb-4">Índice de Saúde Empresarial</h2>
          <div className="flex items-center gap-4">
            <div className="text-5xl font-bold text-primary-600">{data.indiceSaude}</div>
            <div>
              <p className={`font-medium ${RISCO_COLOR[data.classificacaoRisco] || 'text-gray-700'}`}>
                {data.classificacaoRisco}
              </p>
              <p className="text-sm text-gray-500">Score 0-100</p>
            </div>
          </div>
        </div>
        <div className="card">
          <h2 className="font-semibold text-slate-800 mb-4">Valuation</h2>
          {data.valuation ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Conservador</span>
                <span>R$ {data.valuation.conservador.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Moderado</span>
                <span className="font-semibold">R$ {data.valuation.moderado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Agressivo</span>
                <span>R$ {data.valuation.agressivo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">Execute o cron de métricas BI para calcular.</p>
          )}
        </div>
      </div>

      <div className="mt-6">
        <MetasDinamicasCard />
      </div>

      <p className="text-xs text-gray-400 mt-6">
        Métricas atualizadas via cron diário. Configure /api/cron/bi-metrics no seu agendador.
      </p>
    </div>
  )
}
