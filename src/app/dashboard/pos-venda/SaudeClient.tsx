'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, TrendingDown, TrendingUp, Users } from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ProducerRanking {
  name:              string
  origin:            string
  total:             number
  replaced:          number
  active:            number
  suspended:         number
  replacementPct:    number
  avgLifetimeDays:   number | null
  medianLifetimeDays: number | null
  reasons:           Record<string, number>
  topReason:         string | null
  alert:             boolean
}

interface SaudeData {
  period: { days: number; since: string }
  kpis: {
    totalCreds:           number
    totalReplaced:        number
    totalActive:          number
    globalReplacementPct: number
    alertCount:           number
  }
  ranking:        ProducerRanking[]
  globalReasons:  Record<string, number>
  weeklyTimeline: Array<{ week: string; replaced: number; total: number }>
  alertThresholdPct: number
}

// ─── Labels ───────────────────────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  PROFILE_ERROR:  'Erro no Perfil',
  DIRTY_PROXY:    'Proxy Sujo',
  CREATIVE_ISSUE: 'Criativo',
  PLATFORM_BAN:   'Banimento',
  CLIENT_REQUEST: 'Solicitação',
  OTHER:          'Outro',
}

const REASON_COLORS: Record<string, string> = {
  PROFILE_ERROR:  'bg-orange-500/10 text-orange-400 border-orange-500/20',
  DIRTY_PROXY:    'bg-purple-500/10 text-purple-400 border-purple-500/20',
  CREATIVE_ISSUE: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  PLATFORM_BAN:   'bg-red-500/10 text-red-400 border-red-500/20',
  CLIENT_REQUEST: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  OTHER:          'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
}

// ─── Componentes ──────────────────────────────────────────────────────────────

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden w-full">
      <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ─── Dashboard de Saúde ───────────────────────────────────────────────────────

export function SaudeClient() {
  const [data, setData]   = useState<SaudeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays]   = useState(30)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/pos-venda/saude?days=${days}`, { cache: 'no-store' })
      if (res.ok) setData(await res.json() as SaudeData)
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    )
  }

  if (!data) {
    return <p className="text-zinc-500 text-sm text-center py-8">Erro ao carregar dados de saúde.</p>
  }

  const maxTotal = Math.max(...data.ranking.map((r) => r.total), 1)

  return (
    <div className="space-y-6">

      {/* Filtro de período */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-white">Saúde por Fornecedor / Executor</h3>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                days === d ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {d}d
            </button>
          ))}
          <button onClick={load} className="px-2 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />, label: 'Contas Ativas',    value: data.kpis.totalActive },
          { icon: <TrendingDown className="w-4 h-4 text-red-400" />,    label: 'Substituídas',     value: data.kpis.totalReplaced },
          { icon: <TrendingUp className="w-4 h-4 text-amber-400" />,    label: 'Taxa Global',      value: `${data.kpis.globalReplacementPct}%` },
          { icon: <AlertTriangle className="w-4 h-4 text-red-400" />,   label: 'Alertas Ativos',   value: data.kpis.alertCount },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 flex items-center gap-3">
            {k.icon}
            <div>
              <p className="text-xs text-zinc-500">{k.label}</p>
              <p className="text-lg font-bold text-white">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Ranking por fornecedor */}
      {data.ranking.length > 0 ? (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <div className="bg-zinc-800/50 px-4 py-2.5 flex items-center gap-2">
            <Users className="w-4 h-4 text-zinc-400" />
            <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Ranking por Executor / Fornecedor</p>
          </div>
          <div className="divide-y divide-zinc-800">
            {data.ranking.map((r, idx) => (
              <div key={`${r.origin}::${r.name}`} className="px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-zinc-600 text-xs shrink-0 font-mono">#{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-white text-sm truncate">{r.name}</p>
                      <p className="text-zinc-500 text-[11px]">
                        {r.origin === 'INTERNAL' ? '🏭 Produção Interna' : '📦 Fornecedor'} · {r.total} contas
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {r.alert ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                        <AlertTriangle className="w-2.5 h-2.5" /> ALERTA
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        r.replacementPct === 0
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : r.replacementPct < 20
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}>
                        {r.replacementPct}% troca
                      </span>
                    )}
                    {r.medianLifetimeDays != null && (
                      <p className="text-zinc-500 text-[11px] mt-0.5">
                        Mediana: <span className="text-zinc-300">{r.medianLifetimeDays}d</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Barra de volume */}
                <MiniBar
                  value={r.total}
                  max={maxTotal}
                  color={r.alert ? 'bg-red-500' : r.replacementPct < 20 ? 'bg-emerald-500' : 'bg-amber-500'}
                />

                {/* Estatísticas detalhadas */}
                <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                  <span>✅ {r.active} ativas</span>
                  <span>🔄 {r.replaced} substituídas</span>
                  {r.suspended > 0 && <span>⛔ {r.suspended} suspensas</span>}
                  {r.topReason && (
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] ${REASON_COLORS[r.topReason] ?? 'bg-zinc-700 text-zinc-400 border-zinc-600'}`}>
                      {REASON_LABELS[r.topReason] ?? r.topReason}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center text-zinc-500 text-sm">
          Nenhuma credencial registrada no período selecionado.
        </div>
      )}

      {/* Distribuição global de motivos */}
      {Object.keys(data.globalReasons).length > 0 && (
        <div className="rounded-xl border border-zinc-800 p-4 space-y-3">
          <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Motivos de Substituição</h4>
          <div className="space-y-2">
            {Object.entries(data.globalReasons)
              .sort((a, b) => b[1] - a[1])
              .map(([reason, count]) => {
                const total = data.kpis.totalReplaced
                const pct   = total > 0 ? Math.round((count / total) * 100) : 0
                return (
                  <div key={reason} className="flex items-center gap-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border shrink-0 ${REASON_COLORS[reason] ?? 'bg-zinc-700 text-zinc-400 border-zinc-600'}`}>
                      {REASON_LABELS[reason] ?? reason}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${REASON_COLORS[reason]?.includes('orange') ? 'bg-orange-500' : REASON_COLORS[reason]?.includes('purple') ? 'bg-purple-500' : REASON_COLORS[reason]?.includes('blue') ? 'bg-blue-500' : 'bg-red-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-zinc-400 text-xs shrink-0 w-12 text-right">{count} ({pct}%)</span>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Timeline semanal */}
      <div className="rounded-xl border border-zinc-800 p-4 space-y-3">
        <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Semanas (substituições)</h4>
        <div className="flex items-end gap-1.5 h-20">
          {data.weeklyTimeline.map((w) => {
            const maxWeek = Math.max(...data.weeklyTimeline.map((x) => x.total), 1)
            const totalH  = maxWeek > 0 ? (w.total    / maxWeek) * 100 : 0
            const replH   = maxWeek > 0 ? (w.replaced / maxWeek) * 100 : 0
            return (
              <div key={w.week} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full relative flex flex-col justify-end" style={{ height: '60px' }}>
                  <div
                    className="w-full rounded-t bg-zinc-700 absolute bottom-0"
                    style={{ height: `${totalH}%` }}
                  />
                  <div
                    className="w-full rounded-t bg-red-500/70 absolute bottom-0"
                    style={{ height: `${replH}%` }}
                  />
                </div>
                <p className="text-[9px] text-zinc-600 text-center">{w.week}</p>
              </div>
            )
          })}
        </div>
        <div className="flex gap-3 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-zinc-700 inline-block" />Total emitidas</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-500/70 inline-block" />Substituídas</span>
        </div>
      </div>

    </div>
  )
}
