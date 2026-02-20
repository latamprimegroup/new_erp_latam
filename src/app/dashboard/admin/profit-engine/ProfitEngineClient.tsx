'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Snapshot = {
  referenceDate: string
  receitaBruta: number
  receitaLiquida: number
  custoVariavel: number
  custoFixo: number
  margemBruta: number
  margemBrutaPct: number | null
  margemLiquida: number
  margemLiquidaPct: number | null
  lucroOperacional: number
  lucroLiquido: number
  lucroAcumuladoAno: number
  lucroProjetado12m: number | null
  metaLucro12m: number | null
  gapParaMeta: number | null
}

type UnitEcon = {
  tipoConta: string
  moeda: string
  receitaPorUnidade: number
  custoPorUnidade: number
  margemPorUnidade: number
  cacReal: number | null
  ltvReal: number | null
  payback: number | null
  scoreRentabilidade: number | null
  margemNegativa: boolean
}

type Meta100m = {
  metaLucro: number
  margemMediaAtual: number
  receitaNecessaria: number
  volumeNecessario: number
  crescimentoMensalNecessario: number
  ticketMedioIdeal: number
  churnMaximoAceitavel: number
  gapParaMeta: number
  lucroProjetado12m: number
}

type Destroyer = { type: string; severity: string; message: string; details: Record<string, unknown> }

type SimulatorOutput = {
  receitaProjetada: number
  custoProjetado: number
  margemProjetadaPct: number
  lucroProjetado: number
  impactoValuation: number
  crescimentoNecessarioMensal: number
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(v: number) {
  return `${v.toFixed(1)}%`
}

export function ProfitEngineClient() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [unitEconomics, setUnitEconomics] = useState<UnitEcon[]>([])
  const [meta100m, setMeta100m] = useState<Meta100m | null>(null)
  const [destroyers, setDestroyers] = useState<Destroyer[]>([])
  const [loading, setLoading] = useState(true)

  const [simForm, setSimForm] = useState({
    aumentoTicketPct: 0,
    reducaoChurnPct: 0,
    aumentoEficienciaPct: 0,
    reducaoCustoUnidadePct: 0,
    aumentoRetencaoPct: 0,
  })
  const [simResult, setSimResult] = useState<SimulatorOutput | null>(null)
  const [simLoading, setSimLoading] = useState(false)

  function load() {
    setLoading(true)
    Promise.all([
      fetch('/api/admin/profit-engine').then((r) => r.json()),
      fetch('/api/admin/profit-engine/meta-100m').then((r) => r.json()),
      fetch('/api/admin/profit-engine/radar').then((r) => r.json()),
    ])
      .then(([pe, meta, radar]) => {
        setSnapshot(pe.snapshot)
        setUnitEconomics(pe.unitEconomics || [])
        setMeta100m(meta)
        setDestroyers(radar.destroyers || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSimular() {
    setSimLoading(true)
    setSimResult(null)
    try {
      const res = await fetch('/api/admin/profit-engine/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(simForm),
      })
      const data = await res.json()
      if (res.ok) setSimResult(data)
      else alert(data.error || 'Erro')
    } finally {
      setSimLoading(false)
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="heading-1 mb-6">Profit Engine</h1>
        <p className="text-gray-500">Carregando...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex gap-4 items-center mb-6">
        <Link href="/dashboard/admin" className="text-gray-500 hover:text-gray-700">← Admin</Link>
        <h1 className="heading-1">Profit Engine – Engenharia de Lucro e Escala</h1>
      </div>

      <div className="mb-6 p-4 rounded-lg bg-slate-900 text-white">
        <p className="text-sm font-medium">Meta: R$ 100.000.000 de lucro em 12 meses</p>
        <p className="text-xs text-slate-300 mt-1">
          O controle de lucro passa por margem, eficiência, retenção e escala previsível.
        </p>
      </div>

      {/* Indicadores Centrais */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Indicadores Centrais</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="card">
            <p className="text-sm text-gray-500">Lucro projetado 12m</p>
            <p className="text-xl font-bold text-primary-600">
              R$ {snapshot?.lucroProjetado12m != null ? fmt(snapshot.lucroProjetado12m) : '—'}
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500">Lucro acumulado ano</p>
            <p className="text-xl font-bold">
              R$ {snapshot?.lucroAcumuladoAno != null ? fmt(snapshot.lucroAcumuladoAno) : '—'}
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500">Gap para meta 100M</p>
            <p className={`text-xl font-bold ${(snapshot?.gapParaMeta ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
              R$ {snapshot?.gapParaMeta != null ? fmt(snapshot.gapParaMeta) : '—'}
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500">Margem líquida</p>
            <p className="text-xl font-bold">
              {snapshot?.margemLiquidaPct != null ? fmtPct(snapshot.margemLiquidaPct) : '—'}
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500">Receita bruta 12m</p>
            <p className="text-xl font-bold">
              R$ {snapshot?.receitaBruta != null ? fmt(snapshot.receitaBruta) : '—'}
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500">Custo total</p>
            <p className="text-xl font-bold">
              R$ {snapshot ? fmt(snapshot.custoVariavel + snapshot.custoFixo) : '—'}
            </p>
          </div>
        </div>
      </section>

      {/* Meta 100M */}
      {meta100m && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Meta Estrutural 100M</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card">
              <p className="text-sm text-gray-500">Receita necessária</p>
              <p className="font-medium">R$ {fmt(meta100m.receitaNecessaria)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-gray-500">Volume necessário</p>
              <p className="font-medium">{fmt(meta100m.volumeNecessario)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-gray-500">Crescimento mensal necessário</p>
              <p className="font-medium">{fmtPct(meta100m.crescimentoMensalNecessario)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-gray-500">Ticket médio ideal</p>
              <p className="font-medium">R$ {fmt(meta100m.ticketMedioIdeal)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-gray-500">Churn máximo aceitável</p>
              <p className="font-medium">{fmtPct(meta100m.churnMaximoAceitavel)}</p>
            </div>
          </div>
        </section>
      )}

      {/* Radar de Destruição */}
      {destroyers.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Radar de Destruição de Lucro</h2>
          <div className="card border-red-200 bg-red-50">
            <ul className="space-y-2">
              {destroyers.map((d, i) => (
                <li
                  key={`${d.type}-${i}`}
                  className={`px-3 py-2 rounded text-sm ${
                    d.severity === 'CRITICAL' ? 'bg-red-200 text-red-900' :
                    d.severity === 'HIGH' ? 'bg-red-100 text-red-800' :
                    'bg-amber-100 text-amber-800'
                  }`}
                >
                  <span className="font-medium">{d.type}</span> – {d.message}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Simulador */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Simulador de Escala</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="card">
            <div className="space-y-3 mb-4">
              {[
                { key: 'aumentoTicketPct', label: '+ Ticket médio (%)', placeholder: 0 },
                { key: 'reducaoChurnPct', label: '- Churn (%)', placeholder: 0 },
                { key: 'aumentoEficienciaPct', label: '+ Eficiência operacional (%)', placeholder: 0 },
                { key: 'reducaoCustoUnidadePct', label: '- Custo por unidade (%)', placeholder: 0 },
                { key: 'aumentoRetencaoPct', label: '+ Retenção (%)', placeholder: 0 },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-sm text-gray-600 mb-1">{label}</label>
                  <input
                    type="number"
                    value={simForm[key as keyof typeof simForm]}
                    onChange={(e) => setSimForm((p) => ({ ...p, [key]: Number(e.target.value) || 0 }))}
                    className="w-full rounded border-gray-300"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={handleSimular}
              disabled={simLoading}
              className="btn-primary"
            >
              {simLoading ? 'Simulando...' : 'Simular impacto'}
            </button>
          </div>
          {simResult && (
            <div className="card border-green-200 bg-green-50">
              <h3 className="font-medium mb-2">Resultado da simulação</h3>
              <div className="space-y-1 text-sm">
                <p>Lucro projetado: R$ {fmt(simResult.lucroProjetado)}</p>
                <p>Margem projetada: {fmtPct(simResult.margemProjetadaPct)}</p>
                <p>Impacto valuation: R$ {fmt(simResult.impactoValuation)}</p>
                <p>Crescimento mensal necessário: {fmtPct(simResult.crescimentoNecessarioMensal)}</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Unit Economics */}
      {unitEconomics.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Unit Economics por tipo</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Tipo</th>
                  <th className="text-left py-2">Moeda</th>
                  <th className="text-right py-2">Receita/un</th>
                  <th className="text-right py-2">Custo/un</th>
                  <th className="text-right py-2">Margem/un</th>
                  <th className="text-right py-2">Score</th>
                  <th className="text-center py-2">Margem neg.</th>
                </tr>
              </thead>
              <tbody>
                {unitEconomics.map((u, i) => (
                  <tr key={`${u.tipoConta}-${u.moeda}-${i}`} className={u.margemNegativa ? 'bg-red-50' : ''}>
                    <td className="py-2">{u.tipoConta}</td>
                    <td className="py-2">{u.moeda}</td>
                    <td className="text-right py-2">R$ {fmt(u.receitaPorUnidade)}</td>
                    <td className="text-right py-2">R$ {fmt(u.custoPorUnidade)}</td>
                    <td className="text-right py-2">R$ {fmt(u.margemPorUnidade)}</td>
                    <td className="text-right py-2">{u.scoreRentabilidade ?? '—'}</td>
                    <td className="text-center py-2">{u.margemNegativa ? '⚠️ Sim' : 'Não'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
