'use client'

import { useState, useEffect } from 'react'

const TIER_LABELS: Record<string, string> = {
  BRONZE: '🥉 Bronze',
  PRATA: '🥈 Prata',
  OURO: '🥇 Ouro',
  META_BATIDA: '🏆 Meta batida',
  ELITE: '⚡ Elite',
}

type DashboardData = {
  summary: {
    totalOperacoes: number
    emPreparacao: number
    noAr: number
    sobreviveu24h: number
    interrompidas?: number
    quedasDia?: number
    survivedMes?: number
    banidas: number
    taxaSucesso: number
    ultimos7Dias: number
    elegiveis24h: number
    tempoMedioBanHoras: number | null
    previsaoMes?: {
      baseSalary: number
      bonusTotal: number
      total: number
      tier: string | null
      percentMeta: number
      percentElite: number
    } | null
    config?: {
      salarioBase: number
      metaMensal: number
      metaElite: number
      bonusBronze: number
      bonusPrata: number
      bonusOuro: number
      bonusMetaBatida: number
      bonusElite: number
    }
  }
  byStatus: Record<string, number>
  porNicho: Array<{ nicho: string; total: number; live: number; survived: number; banned: number }>
  payments: { totalPending: number; totalPaid: number; countPending: number }
  porColaborador?: Array<{
    collaboratorId: string
    name: string | null
    email: string
    total: number
    live: number
    survived: number
    survivedMes?: number
    previsaoTotal?: number
    tier?: string | null
    banned: number
    pending: number
    paid: number
  }>
}

export function PlugPlayDashboard({ isAdmin = false }: { isAdmin?: boolean }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  function load(silent = false) {
    if (!silent) setLoading(true)
    fetch('/api/black/dashboard')
      .then((r) => r.json())
      .then((d) => {
        if (d && d.summary && typeof d.summary === 'object') setData(d as DashboardData)
        else setData(null)
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) {
    return (
      <div className="animate-pulse grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="card h-24 bg-gray-100" />
        ))}
      </div>
    )
  }

  if (!data) {
    return <p className="text-gray-500 py-4">Não foi possível carregar os indicadores.</p>
  }

  const s = data.summary
  const p = data.payments

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => load(true)}
          className="text-sm text-gray-500 hover:text-primary-600"
        >
          Atualizar indicadores
        </button>
      </div>

      {/* Metas e ganho previsto - foco principal */}
      {s.previsaoMes && s.config && (
        <div className="card bg-gradient-to-r from-primary-500/5 to-amber-50 border-2 border-primary-600/20">
          <h3 className="font-bold text-primary-600 mb-4">⚡ Metas de Execução – Mês Atual</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-xs text-gray-500">Contas +24h (mês)</p>
              <p className="text-2xl font-bold">{s.survivedMes ?? 0}</p>
              <p className="text-xs text-gray-500">Meta: {s.config.metaMensal} · Elite: {s.config.metaElite}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">% Meta padrão</p>
              <p className="text-2xl font-bold text-primary-600">{s.previsaoMes.percentMeta}%</p>
              <div className="h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-primary-500 rounded-full" style={{ width: `${Math.min(100, s.previsaoMes.percentMeta)}%` }} />
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500">% Meta elite</p>
              <p className="text-2xl font-bold text-amber-600">{s.previsaoMes.percentElite}%</p>
              <div className="h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, s.previsaoMes.percentElite)}%` }} />
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500">Nível atual</p>
              <p className="text-lg font-bold">
                {s.previsaoMes.tier ? TIER_LABELS[s.previsaoMes.tier] || s.previsaoMes.tier : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Previsão ganho</p>
              <p className="text-2xl font-bold text-green-700">R$ {s.previsaoMes.total.toLocaleString('pt-BR')}</p>
              <p className="text-xs text-gray-500">Base R$ {s.previsaoMes.baseSalary.toLocaleString('pt-BR')} + bônus R$ {s.previsaoMes.bonusTotal.toLocaleString('pt-BR')}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Salário base: R$ {s.config.salarioBase.toLocaleString('pt-BR')} · 200: +R${' '}
            {s.config.bonusBronze.toLocaleString('pt-BR')} · 250: +R${' '}
            {s.config.bonusPrata.toLocaleString('pt-BR')} · 300: +R${' '}
            {s.config.bonusOuro.toLocaleString('pt-BR')} · {s.config.metaMensal}: +R${' '}
            {s.config.bonusMetaBatida.toLocaleString('pt-BR')} · {s.config.metaElite} Elite: +R${' '}
            {s.config.bonusElite.toLocaleString('pt-BR')}
          </p>
        </div>
      )}

      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="card border-l-4 border-l-primary-600">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total operações</p>
          <p className="text-2xl font-bold text-primary-600 mt-1">{s.totalOperacoes}</p>
        </div>
        <div className="card border-l-4 border-l-amber-500">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Em preparação</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{s.emPreparacao}</p>
        </div>
        <div className="card border-l-4 border-l-green-500">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">No ar agora</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{s.noAr}</p>
        </div>
        <div className="card border-l-4 border-l-blue-500">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Sobreviveu 24h</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{s.sobreviveu24h}</p>
        </div>
        <div className="card border-l-4 border-l-red-500">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Banidas</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{s.banidas}</p>
        </div>
        <div className="card border-l-4 border-l-emerald-600">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Taxa de sucesso</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{s.taxaSucesso}%</p>
        </div>
      </div>

      {/* Segunda linha: pagamentos legados por conta + ritmo semanal + tempo médio até ban */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-200 uppercase tracking-wide">
            {isAdmin ? 'Pendente (líquido)' : 'Pendente (legado)'}
          </p>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">R$ {p.totalPending.toLocaleString('pt-BR')}</p>
          {p.countPending > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              {isAdmin
                ? `${p.countPending} conta(s)`
                : `${p.countPending} conta(s) — pagamento antigo`}
            </p>
          )}
        </div>
        <div className="card bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/40">
          <p className="text-xs font-medium text-green-800 dark:text-green-200 uppercase tracking-wide">
            {isAdmin ? 'Já pago (líquido)' : 'Já pago (legado)'}
          </p>
          <p className="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">R$ {p.totalPaid.toLocaleString('pt-BR')}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {isAdmin ? 'Nota: salário + bônus por meta' : 'Novo: salário + bônus por meta'}
          </p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Últimos 7 dias</p>
          <p className="text-2xl font-bold text-[#1F2937] dark:text-white mt-1">{s.ultimos7Dias}</p>
          <p className="text-xs text-gray-500 mt-1">Operações criadas</p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tempo médio até ban</p>
          <p className="text-2xl font-bold text-[#1F2937] dark:text-white mt-1">
            {s.tempoMedioBanHoras != null ? `${s.tempoMedioBanHoras}h` : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Das contas banidas</p>
        </div>
      </div>

      {/* Por status - barra visual */}
      <div className="card">
        <h3 className="font-semibold text-[#1F2937] mb-4">Distribuição por status</h3>
        <div className="space-y-3">
          {[
            { key: 'DRAFT', label: 'Rascunho', color: 'bg-gray-400' },
            { key: 'EM_AQUECIMENTO', label: 'Em aquecimento', color: 'bg-amber-400' },
            { key: 'EM_CONFIG', label: 'Em configuração', color: 'bg-amber-500' },
            { key: 'LIVE', label: 'No ar', color: 'bg-green-500' },
            { key: 'SURVIVED_24H', label: 'Sobreviveu 24h', color: 'bg-blue-500' },
            { key: 'BANNED', label: 'Banida', color: 'bg-red-500' },
          ].map(({ key, label, color }) => {
            const count = data.byStatus[key] || 0
            const pct = s.totalOperacoes > 0 ? Math.round((count / s.totalOperacoes) * 100) : 0
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="text-sm w-36">{label}</span>
                <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${color} rounded-full transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-sm font-medium w-12 text-right">{count}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Por nicho */}
      {data.porNicho.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-[#1F2937] mb-4">Por nicho</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">Nicho</th>
                  <th className="pb-2 pr-4 text-right">Total</th>
                  <th className="pb-2 pr-4 text-right">No ar</th>
                  <th className="pb-2 pr-4 text-right">+24h</th>
                  <th className="pb-2 text-right">Banidas</th>
                </tr>
              </thead>
              <tbody>
                {data.porNicho.map((n) => (
                  <tr key={n.nicho} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-4 font-medium">{n.nicho}</td>
                    <td className="py-2 pr-4 text-right">{n.total}</td>
                    <td className="py-2 pr-4 text-right text-green-600">{n.live}</td>
                    <td className="py-2 pr-4 text-right text-blue-600">{n.survived}</td>
                    <td className="py-2 text-right text-red-600">{n.banned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Por colaborador - apenas admin */}
      {isAdmin && data.porColaborador && data.porColaborador.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-[#1F2937] mb-4">Por colaborador (metas +24h no mês)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">Colaborador</th>
                  <th className="pb-2 pr-4 text-right">Total</th>
                  <th className="pb-2 pr-4 text-right">+24h mês</th>
                  <th className="pb-2 pr-4 text-right">Nível</th>
                  <th className="pb-2 pr-4 text-right">Previsão</th>
                  <th className="pb-2 pr-4 text-right">No ar</th>
                  <th className="pb-2 pr-4 text-right">Banidas</th>
                  <th className="pb-2 text-right">Pago (legado)</th>
                </tr>
              </thead>
              <tbody>
                {data.porColaborador.map((c) => (
                  <tr key={c.collaboratorId} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-4">
                      <span className="font-medium">{c.name || c.email}</span>
                      {c.name && <span className="text-gray-400 text-xs block">{c.email}</span>}
                    </td>
                    <td className="py-2 pr-4 text-right">{c.total}</td>
                    <td className="py-2 pr-4 text-right font-medium">{c.survivedMes ?? 0}</td>
                    <td className="py-2 pr-4 text-right">{c.tier ? TIER_LABELS[c.tier] || c.tier : '—'}</td>
                    <td className="py-2 pr-4 text-right font-medium text-green-700">R$ {(c.previsaoTotal ?? 0).toLocaleString('pt-BR')}</td>
                    <td className="py-2 pr-4 text-right text-green-600">{c.live}</td>
                    <td className="py-2 pr-4 text-right text-red-600">{c.banned}</td>
                    <td className="py-2 text-right text-gray-600">R$ {c.paid.toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Alerta elegíveis 24h - apenas admin */}
      {isAdmin && s.elegiveis24h > 0 && (
        <div className="card bg-amber-50 border-amber-200">
          <p className="font-medium text-amber-800">
            {s.elegiveis24h} operação(ões) LIVE há +24h aguardando processamento de pagamento.
          </p>
          <p className="text-sm text-amber-700 mt-1">
            Acesse Plug & Play Black → Processar sobreviventes 24h para gerar os pagamentos.
          </p>
        </div>
      )}
    </div>
  )
}
