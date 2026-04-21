'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type CacData = {
  cac: number; ltv: number; ltvCacRatio: number | null; margin: number
  totalMarketing: number; revenue: number; salesCount: number
  alert: { level: 'GREEN' | 'YELLOW' | 'RED'; message: string }
  series: { month: string; cac: number; sales: number }[]
}

function CacTermometro() {
  const [cac, setCac] = useState<CacData | null>(null)

  useEffect(() => {
    fetch('/api/admin/cac?months=1')
      .then((r) => r.json())
      .then(setCac)
      .catch(() => {})
  }, [])

  if (!cac) return null

  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const levelCss = {
    GREEN:  'border-green-300 bg-green-50 dark:bg-green-950/20',
    YELLOW: 'border-amber-300 bg-amber-50 dark:bg-amber-950/20',
    RED:    'border-red-400 bg-red-50 dark:bg-red-950/20 animate-pulse',
  }[cac.alert.level]
  const levelText = { GREEN: 'text-green-700', YELLOW: 'text-amber-700', RED: 'text-red-700' }[cac.alert.level]
  const levelDot  = { GREEN: 'bg-green-500', YELLOW: 'bg-amber-500', RED: 'bg-red-500' }[cac.alert.level]

  return (
    <div className={`card border-2 mb-6 ${levelCss}`}>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2.5 h-2.5 rounded-full ${levelDot}`} />
            <h2 className="font-semibold text-slate-800 dark:text-zinc-100">Termômetro de CAC — Este Mês</h2>
          </div>
          <p className={`text-sm font-medium ${levelText}`}>{cac.alert.message}</p>
        </div>
        <div className="flex items-center gap-1">
          {[...Array(5)].map((_, i) => (
            <div key={i}
              className={`w-3 h-8 rounded transition-all ${i < Math.ceil((cac.cac / 400) * 5) ? (cac.alert.level === 'RED' ? 'bg-red-500' : cac.alert.level === 'YELLOW' ? 'bg-amber-400' : 'bg-green-500') : 'bg-zinc-200 dark:bg-zinc-700'}`}
              style={{ height: `${(i + 1) * 8 + 16}px` }}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <div>
          <p className="text-xs text-zinc-500 mb-0.5">CAC</p>
          <p className={`text-xl font-bold ${levelText}`}>{brl(cac.cac)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 mb-0.5">LTV Médio</p>
          <p className="text-xl font-bold text-primary-600">{brl(cac.ltv)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 mb-0.5">LTV/CAC</p>
          <p className={`text-xl font-bold ${(cac.ltvCacRatio ?? 0) >= 3 ? 'text-green-600' : 'text-amber-600'}`}>
            {cac.ltvCacRatio != null ? `${cac.ltvCacRatio}x` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 mb-0.5">Margem</p>
          <p className={`text-xl font-bold ${cac.margin >= 40 ? 'text-green-600' : cac.margin >= 20 ? 'text-amber-600' : 'text-red-600'}`}>
            {cac.margin}%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-3 text-xs text-zinc-500">
        <span>📦 {cac.salesCount} vendas</span>
        <span>💰 {brl(cac.revenue)} receita</span>
        <span>📣 {brl(cac.totalMarketing)} marketing</span>
      </div>

      {cac.alert.level !== 'GREEN' && (
        <div className={`mt-3 rounded-lg p-2 text-xs font-medium ${levelText} border ${levelCss.split(' ')[0]}`}>
          ⚠️ {cac.alert.level === 'RED' ? 'ALERTA CRÍTICO: ' : 'ATENÇÃO: '}{cac.alert.message}. Revise as despesas de marketing ou aumente o volume de vendas.
        </div>
      )}
    </div>
  )
}

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

function KillSwitchTorreControle() {
  const [active, setActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/kill-switch')
      .then((r) => r.json())
      .then((d) => setActive(!!d.active))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function toggle() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/kill-switch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !active }),
      })
      if (res.ok) {
        const d = await res.json()
        setActive(!!d.active)
      } else alert('Não foi possível alterar o kill switch')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  return (
    <div className={`card mb-6 border-2 ${active ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}>
      <h2 className="font-semibold text-slate-800 mb-2">Kill switch global (Torre de Controle)</h2>
      <p className="text-sm text-gray-600 mb-4">
        Quando ativo, todas as APIs que usam <code className="text-xs bg-gray-100 px-1 rounded">requireAuth</code> retornam
        503 para perfis que não são ADMIN. Webhooks PIX/afiliados continuam recebendo (não passam por requireAuth).
      </p>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={saving}
        className={active ? 'btn-secondary' : 'px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 text-sm'}
      >
        {saving ? '…' : active ? 'Desativar pausa operacional' : 'Ativar pausa operacional'}
      </button>
    </div>
  )
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

      <KillSwitchTorreControle />
      <CacTermometro />

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
