'use client'

import { useState, useEffect } from 'react'

type Relatorio = {
  data: string
  ranking?: { name: string | null; count: number; rank: number }[]
  vendas: {
    contasHoje: number
    valorHoje: number
    pedidosHoje: number
    contasMes: number
    valorMes: number
    percentualMeta: number
    metaMensal: number
    faltamParaMeta: number
    ritmoNecessario: number
    noRitmo: boolean
  }
  producao: {
    contasHoje: number
    contasMes: number
    percentualMeta: number
    metaMensal: number
    faltamParaMeta: number
    ritmoNecessario: number
    diasRestantes: number
    projecaoFimMes: number
    metaEmRisco: boolean
    noRitmo: boolean
  }
  resumo: string
}

export function RelatorioDiarioClient() {
  const [rel, setRel] = useState<Relatorio | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/relatorio-diario')
      if (res.ok) setRel(await res.json())
    } catch {
      setRel(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function sendNow() {
    setSending(true)
    try {
      const res = await fetch('/api/admin/relatorio-diario', { method: 'POST' })
      const data = await res.json()
      if (res.ok) alert(`Enviado para ${data.sent} admin(s)`)
      else alert(data.error || 'Erro')
    } catch {
      alert('Erro ao enviar')
    }
    setSending(false)
  }

  if (loading) {
    return (
      <div className="card animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="h-32 bg-gray-100 rounded" />
      </div>
    )
  }

  if (!rel) {
    return (
      <div className="card">
        <p className="text-slate-600">Erro ao carregar relatório.</p>
        <button onClick={load} className="btn-secondary mt-2">
          Tentar novamente
        </button>
      </div>
    )
  }

  const p = rel.producao
  const v = rel.vendas

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-slate-600">
          Atualizado em tempo real · Data: {rel.data}
        </p>
        <button
          onClick={sendNow}
          disabled={sending}
          className="btn-primary text-sm"
        >
          {sending ? 'Enviando...' : 'Enviar notificação agora'}
        </button>
      </div>

      {/* Produção */}
      <div
        className={`card border-2 ${
          p.metaEmRisco ? 'border-amber-200 bg-amber-50/30' : 'border-emerald-200/50 bg-emerald-50/20'
        }`}
      >
        <h2 className="font-semibold text-slate-800 mb-4">📦 Produção</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-500">Hoje</p>
            <p className="text-2xl font-bold text-primary-600">{p.contasHoje}</p>
            <p className="text-sm text-slate-600">contas</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Mês</p>
            <p className="text-2xl font-bold text-primary-600">{p.contasMes}</p>
            <p className="text-sm text-slate-600">/ {p.metaMensal} ({p.percentualMeta}%)</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Faltam</p>
            <p className={`text-2xl font-bold ${p.faltamParaMeta > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {p.faltamParaMeta}
            </p>
            <p className="text-sm text-slate-600">ritmo: {p.ritmoNecessario}/dia</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Projeção</p>
            <p className="text-2xl font-bold text-slate-800">{p.projecaoFimMes}</p>
            <p className="text-sm">
              {p.metaEmRisco ? '⚠️ Meta em risco' : '✅ No ritmo'}
            </p>
          </div>
        </div>
      </div>

      {/* Vendas */}
      <div className="card">
        <h2 className="font-semibold text-slate-800 mb-4">💰 Vendas</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-500">Hoje</p>
            <p className="text-2xl font-bold text-primary-600">{v.contasHoje}</p>
            <p className="text-sm text-slate-600">
              {v.pedidosHoje} pedidos · R$ {v.valorHoje.toLocaleString('pt-BR')}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Mês</p>
            <p className="text-2xl font-bold text-primary-600">{v.contasMes}</p>
            <p className="text-sm text-slate-600">/ {v.metaMensal} ({v.percentualMeta}%)</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Faturamento mês</p>
            <p className="text-xl font-bold text-slate-800">
              R$ {v.valorMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Faltam</p>
            <p className="text-2xl font-bold text-slate-800">{v.faltamParaMeta}</p>
            <p className="text-sm text-slate-600">
              {v.noRitmo ? '✅ No ritmo' : `ritmo: ${v.ritmoNecessario}/dia`}
            </p>
          </div>
        </div>
      </div>

      {/* Ranking */}
      {rel.ranking && rel.ranking.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-slate-800 mb-3">🏆 Ranking do mês</h2>
          <ul className="space-y-2">
            {rel.ranking!.slice(0, 10).map((r: { name: string | null; count: number; rank: number }) => (
              <li key={r.rank} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                <span>
                  <span className="font-medium text-slate-700">{r.rank}.</span> {r.name || '-'}
                </span>
                <span className="font-semibold text-primary-600">{r.count} contas</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Resumo textual */}
      <div className="card bg-slate-50">
        <h2 className="font-semibold text-slate-800 mb-2">Resumo</h2>
        <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">{rel.resumo}</pre>
      </div>
    </div>
  )
}
