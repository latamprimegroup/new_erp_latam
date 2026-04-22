'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  Rocket, TrendingUp, Zap, Target, Shield, AlertTriangle, Loader2,
  RefreshCw, ChevronRight, ArrowUpRight, ArrowDownRight, Users,
  Sparkles, DollarSign, BarChart2, Globe2, Flame,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

type Action = {
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM'
  title:    string
  reason:   string
  impact:   string
  action:   string
  data?:    Record<string, number | string>
}

type Strategy = {
  score:            number
  invest_more:      Action[]
  cut_loss:         Action[]
  automation_alert: Action[]
  narrative?:       string
  timestamp:        string
}

type ScaleData = {
  baseRevenue: number
  projection:  { conservative: number[]; base: number[]; aggressive: number[] }
  labels:      string[]
  milestones:  { million: Record<string,number>; billion: Record<string,number> }
  teamEfficiency: { revenue: number; grossMargin: number; team: number; rPM: number; mPM: number; teamNeededWithoutAuto: number; teamNeededWithAuto: number }
  velocity:    { sold30: number; dailyVelocity: number; flashCount: number; hotCount: number; pricingSuggestions: { type: string; message: string; impact: string }[] }
  reinvestmentScenarios: { pct: number; monthlyAdd: number; projected12: number; impact: string }[]
  targets:     { million: number; billion: number }
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatadores
// ─────────────────────────────────────────────────────────────────────────────

const BRL   = (v: number) => `R$${Math.round(v).toLocaleString('pt-BR')}`
const BRLfull = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const MILS  = (v: number) => v >= 1_000_000 ? `R$${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `R$${(v / 1000).toFixed(0)}k` : BRL(v)

// ─────────────────────────────────────────────────────────────────────────────
// Action Card (Invest / Cut / Auto)
// ─────────────────────────────────────────────────────────────────────────────

const PRI_STYLE: Record<string, string> = {
  CRITICAL: 'border-l-red-500',
  HIGH:     'border-l-orange-400',
  MEDIUM:   'border-l-amber-400',
}

function ActionCard({ action, type }: { action: Action; type: 'invest' | 'cut' | 'auto' }) {
  const [open, setOpen] = useState(action.priority === 'CRITICAL')
  const typeColor = type === 'invest' ? 'text-green-600' : type === 'cut' ? 'text-red-600' : 'text-blue-600'

  return (
    <div className={`rounded-xl border border-l-4 ${PRI_STYLE[action.priority]} bg-white dark:bg-ads-dark-card border-zinc-100 dark:border-zinc-700 overflow-hidden`}>
      <button onClick={() => setOpen((v) => !v)} className="w-full px-4 py-3 text-left flex items-start gap-3">
        <span className={`shrink-0 text-xs font-black px-1.5 py-0.5 rounded mt-0.5 ${action.priority === 'CRITICAL' ? 'bg-red-100 text-red-700' : action.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'}`}>
          {action.priority === 'CRITICAL' ? '🚨' : action.priority === 'HIGH' ? '🔥' : '📋'}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight">{action.title}</p>
          <p className={`text-xs font-semibold mt-0.5 ${typeColor}`}>{action.impact}</p>
        </div>
        <ChevronRight className={`w-4 h-4 text-zinc-300 shrink-0 mt-0.5 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-2 border-t border-zinc-50 dark:border-zinc-800 pt-2">
          <p className="text-xs text-zinc-500 leading-relaxed">{action.reason}</p>
          <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2">
            <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-0.5">✅ Ação:</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{action.action}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Score Gauge
// ─────────────────────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'
  const r = 44; const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 55 55)"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
        <text x="55" y="52" textAnchor="middle" fontSize="22" fontWeight="900" fill={color}>{score}</text>
        <text x="55" y="68" textAnchor="middle" fontSize="9" fill="#9ca3af">/100</text>
      </svg>
      <p className="text-xs font-bold text-zinc-500">Saúde Operacional</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Gráfico de Projeção
// ─────────────────────────────────────────────────────────────────────────────

function ProjectionChart({ data, labels, targets }: {
  data: ScaleData['projection']; labels: string[]; targets: { million: number; billion: number }
}) {
  const chartData = labels.map((label, i) => ({
    label,
    conservador: Math.round(data.conservative[i]),
    base:        Math.round(data.base[i]),
    agressivo:   Math.round(data.aggressive[i]),
  }))

  const maxVal = Math.max(...data.aggressive)

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradAgg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradBase" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradCons" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} interval={3} />
        <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} tickFormatter={(v) => MILS(v)} width={55} />
        <Tooltip
          formatter={(v: number, name: string) => [BRLfull(v), name]}
          contentStyle={{ fontSize: 11, borderRadius: 8 }}
        />
        {targets.million <= maxVal && (
          <ReferenceLine y={targets.million} stroke="#22c55e" strokeDasharray="6 3" label={{ value: 'R$1M/mês', fill: '#22c55e', fontSize: 9 }} />
        )}
        {targets.billion <= maxVal && (
          <ReferenceLine y={targets.billion} stroke="#6366f1" strokeDasharray="6 3" label={{ value: 'Bilhão', fill: '#6366f1', fontSize: 9 }} />
        )}
        <Area type="monotone" dataKey="conservador" stroke="#f59e0b" strokeWidth={1.5} fill="url(#gradCons)" dot={false} />
        <Area type="monotone" dataKey="base"         stroke="#22c55e" strokeWidth={2}   fill="url(#gradBase)" dot={false} />
        <Area type="monotone" dataKey="agressivo"    stroke="#6366f1" strokeWidth={2.5} fill="url(#gradAgg)"  dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Principal
// ─────────────────────────────────────────────────────────────────────────────

export function ScaleBillionDashboard() {
  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [scale,    setScale]    = useState<ScaleData | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [activeBlock, setActiveBlock] = useState<'invest' | 'cut' | 'auto'>('invest')

  const load = useCallback(async () => {
    setLoading(true)
    const [s, sc] = await Promise.all([
      fetch('/api/admin/alfredo/strategy').then((r) => r.ok ? r.json() : null),
      fetch('/api/admin/alfredo/scale').then((r) => r.ok ? r.json() : null),
    ])
    setStrategy(s); setScale(sc)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-600 to-violet-600 flex items-center justify-center animate-pulse shadow-lg">
        <Globe2 className="w-8 h-8 text-white" />
      </div>
      <div className="text-center">
        <p className="font-black text-lg">Analisando operação global...</p>
        <p className="text-sm text-zinc-400">ALFREDO IA calculando estratégia de escala</p>
      </div>
      <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
    </div>
  )

  const sc = scale; const st = strategy

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-primary-600 flex items-center justify-center shadow-md">
            <Rocket className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-black text-lg tracking-tight">Scale to Billion</h2>
            <p className="text-xs text-zinc-400">Motor de Decisão · Antifragilidade · Projeção Exponencial</p>
          </div>
        </div>
        <button onClick={load} className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
          <RefreshCw className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {/* ── Narrativa da IA ─────────────────────────────────────────────────── */}
      {st?.narrative && (
        <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-primary-50 dark:from-violet-950/20 dark:to-primary-950/20 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{st.narrative}</p>
          </div>
        </div>
      )}

      {/* ── Score + KPIs principais ─────────────────────────────────────────── */}
      {st && sc && (
        <div className="grid md:grid-cols-4 gap-4">
          <div className="flex items-center justify-center md:col-span-1 bg-white dark:bg-ads-dark-card rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4">
            <ScoreGauge score={st.score} />
          </div>
          <div className="md:col-span-3 grid sm:grid-cols-3 gap-3">
            {[
              { label: 'Receita/Colaborador', value: MILS(sc.teamEfficiency.rPM), icon: <Users className="w-4 h-4" />, good: sc.teamEfficiency.rPM >= 50_000, note: `${sc.teamEfficiency.team} pessoas no time` },
              { label: 'Velocidade (30d)', value: `${sc.velocity.sold30} vendas`, icon: <TrendingUp className="w-4 h-4" />, good: sc.velocity.dailyVelocity >= 2, note: `${sc.velocity.dailyVelocity.toFixed(1)}/dia` },
              { label: 'Capital Morto', value: `${sc.velocity.flashCount} ativos`, icon: <DollarSign className="w-4 h-4" />, good: sc.velocity.flashCount === 0, note: sc.velocity.flashCount > 0 ? 'parados >21 dias' : 'giro saudável' },
            ].map((k) => (
              <div key={k.label} className={`rounded-xl border p-4 ${k.good ? 'border-green-200 bg-green-50 dark:bg-green-950/10' : 'border-amber-200 bg-amber-50 dark:bg-amber-950/10'}`}>
                <div className={`flex items-center gap-1.5 mb-1 ${k.good ? 'text-green-600' : 'text-amber-600'}`}>{k.icon}<span className="text-xs font-bold">{k.label}</span></div>
                <p className={`text-2xl font-black ${k.good ? 'text-green-700' : 'text-amber-700'}`}>{k.value}</p>
                <p className="text-xs text-zinc-400 mt-0.5">{k.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Ações Estratégicas ─────────────────────────────────────────────── */}
      {st && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-zinc-100 dark:border-zinc-800">
            {([
              { key: 'invest', label: 'Invest More', icon: <ArrowUpRight className="w-3.5 h-3.5" />, count: st.invest_more.length, color: 'text-green-600', activeColor: 'bg-green-50 dark:bg-green-950/20 border-green-500' },
              { key: 'cut',    label: 'Cut Loss',    icon: <ArrowDownRight className="w-3.5 h-3.5" />, count: st.cut_loss.length, color: 'text-red-600', activeColor: 'bg-red-50 dark:bg-red-950/20 border-red-500' },
              { key: 'auto',   label: 'Automatizar', icon: <Zap className="w-3.5 h-3.5" />, count: st.automation_alert.length, color: 'text-blue-600', activeColor: 'bg-blue-50 dark:bg-blue-950/20 border-blue-500' },
            ] as const).map((t) => (
              <button key={t.key} onClick={() => setActiveBlock(t.key as typeof activeBlock)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold border-b-2 transition-colors ${activeBlock === t.key ? t.activeColor + ' ' + t.color : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}>
                {t.icon}{t.label}
                <span className={`ml-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${activeBlock === t.key ? 'bg-current text-white' : 'bg-zinc-100 text-zinc-500'}`}
                  style={activeBlock === t.key ? {} : {}}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
          <div className="p-4 space-y-2">
            {activeBlock === 'invest' && (
              st.invest_more.length === 0
                ? <p className="text-sm text-zinc-400 text-center py-6">✅ Sem oportunidades de investimento urgentes no momento.</p>
                : st.invest_more.map((a, i) => <ActionCard key={i} action={a} type="invest" />)
            )}
            {activeBlock === 'cut' && (
              st.cut_loss.length === 0
                ? <p className="text-sm text-green-600 text-center py-6">✅ Nenhum vazamento de margem detectado.</p>
                : st.cut_loss.map((a, i) => <ActionCard key={i} action={a} type="cut" />)
            )}
            {activeBlock === 'auto' && (
              st.automation_alert.length === 0
                ? <p className="text-sm text-zinc-400 text-center py-6">✅ Operação eficiente — nenhum gargalo humano crítico identificado.</p>
                : st.automation_alert.map((a, i) => <ActionCard key={i} action={a} type="auto" />)
            )}
          </div>
        </div>
      )}

      {/* ── Projeção Exponencial ────────────────────────────────────────────── */}
      {sc && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-black flex items-center gap-2"><BarChart2 className="w-5 h-5 text-violet-500" />Projeção Exponencial — 24 Meses</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Base atual: {MILS(sc.baseRevenue)}/mês · 3 cenários de crescimento composto</p>
            </div>
            <div className="flex gap-3 text-[10px]">
              {[
                { label: 'Conservador (+8%/mês)', color: 'bg-amber-400' },
                { label: 'Base (+18%/mês)',        color: 'bg-green-500' },
                { label: 'Agressivo (+30%/mês)',   color: 'bg-violet-500' },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-1">
                  <div className={`w-3 h-1.5 rounded-full ${l.color}`} /><span className="text-zinc-500">{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          <ProjectionChart data={sc.projection} labels={sc.labels} targets={sc.targets} />

          {/* Marcos */}
          <div className="grid sm:grid-cols-3 gap-3">
            {(['conservative', 'base', 'aggressive'] as const).map((k) => {
              const label   = k === 'conservative' ? 'Conservador' : k === 'base' ? 'Base' : 'Agressivo'
              const mMths   = sc.milestones.million[k]
              const bMths   = sc.milestones.billion[k]
              const color   = k === 'conservative' ? 'border-amber-200 bg-amber-50' : k === 'base' ? 'border-green-200 bg-green-50' : 'border-violet-200 bg-violet-50'
              const tColor  = k === 'conservative' ? 'text-amber-700' : k === 'base' ? 'text-green-700' : 'text-violet-700'
              return (
                <div key={k} className={`rounded-xl border ${color} dark:bg-transparent p-3 text-center`}>
                  <p className={`text-xs font-bold ${tColor} mb-2`}>{label}</p>
                  <div className="space-y-1">
                    <div><span className="text-[10px] text-zinc-500">R$1M/mês em</span><p className={`text-lg font-black ${tColor}`}>{mMths === 0 ? 'Já atingido!' : `${mMths} meses`}</p></div>
                    <div className="border-t border-current border-opacity-10 pt-1">
                      <span className="text-[10px] text-zinc-500">Bilhão anual em</span>
                      <p className={`text-sm font-bold ${tColor}`}>{bMths === 0 ? '✅ Atingido!' : bMths > 120 ? '>10 anos' : `${bMths} meses`}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Reinvestimento ─────────────────────────────────────────────────── */}
      {sc && sc.reinvestmentScenarios && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-5 space-y-3">
          <h3 className="font-black flex items-center gap-2"><Target className="w-5 h-5 text-green-500" />Simulador de Reinvestimento</h3>
          <p className="text-xs text-zinc-400">Qual % do lucro bruto de {MILS(sc.teamEfficiency.grossMargin)}/mês você reinveste em ativos?</p>
          <div className="grid sm:grid-cols-4 gap-3">
            {sc.reinvestmentScenarios.map((r) => (
              <div key={r.pct} className={`rounded-xl border p-3 text-center ${r.pct >= 30 ? 'border-green-300 bg-green-50 dark:bg-green-950/10' : 'border-zinc-200 dark:border-zinc-700'}`}>
                <p className={`text-2xl font-black ${r.pct >= 30 ? 'text-green-700' : 'text-zinc-600 dark:text-zinc-300'}`}>{r.pct}%</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">+{BRL(r.monthlyAdd)}/mês</p>
                <p className={`text-xs font-bold mt-1 ${r.pct >= 30 ? 'text-green-600' : 'text-zinc-500'}`}>{MILS(r.projected12)}</p>
                <p className="text-[9px] text-zinc-400">em 12 meses</p>
                {r.pct >= 30 && <p className="text-[9px] text-green-600 font-bold mt-1">⭐ Recomendado</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Precificação Dinâmica ──────────────────────────────────────────── */}
      {sc?.velocity?.pricingSuggestions && sc.velocity.pricingSuggestions.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-5 space-y-3">
          <h3 className="font-black flex items-center gap-2"><Flame className="w-5 h-5 text-orange-500" />Yield Management — Precificação Dinâmica</h3>
          <div className="space-y-2">
            {sc.velocity.pricingSuggestions.map((s, i) => {
              const isUp   = s.type === 'INCREASE'
              const isFlash = s.type === 'FLASH_SALE'
              return (
                <div key={i} className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${isUp ? 'border-green-200 bg-green-50 dark:bg-green-950/10' : isFlash ? 'border-orange-200 bg-orange-50 dark:bg-orange-950/10' : 'border-zinc-200 dark:border-zinc-700'}`}>
                  <span className="text-lg shrink-0">{isUp ? '📈' : isFlash ? '⚡' : '⚖️'}</span>
                  <div className="flex-1">
                    <p className={`text-sm font-bold ${isUp ? 'text-green-700' : isFlash ? 'text-orange-700' : 'text-zinc-600'}`}>{s.type === 'INCREASE' ? 'Aumentar Markup' : s.type === 'FLASH_SALE' ? 'Oferta Relâmpago' : 'Manter Preço'}</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">{s.message}</p>
                    <p className={`text-xs font-semibold mt-1 ${isUp ? 'text-green-600' : 'text-orange-600'}`}>{s.impact}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Eficiência do Time ─────────────────────────────────────────────── */}
      {sc?.teamEfficiency && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-5 space-y-3">
          <h3 className="font-black flex items-center gap-2"><Users className="w-5 h-5 text-primary-500" />Métrica de Eficiência: Revenue per Headcount</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-zinc-500 mb-2">Atual: {sc.teamEfficiency.team} colaboradores</p>
              <div className="space-y-2">
                {[
                  { label: 'Receita/Pessoa', val: sc.teamEfficiency.rPM, target: 100_000 },
                  { label: 'Margem/Pessoa',  val: sc.teamEfficiency.mPM, target: 60_000 },
                ].map((m) => (
                  <div key={m.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-500">{m.label}</span>
                      <span className="font-bold">{MILS(m.val)} <span className="text-zinc-400">/ meta {MILS(m.target)}</span></span>
                    </div>
                    <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${m.val >= m.target ? 'bg-green-500' : m.val >= m.target * 0.5 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(100, (m.val / m.target) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-primary-100 bg-primary-50 dark:bg-primary-950/10 p-4 text-center">
              <p className="text-xs text-primary-600 font-bold mb-2">Para atingir R$1M/mês</p>
              <div className="space-y-2">
                <div>
                  <p className="text-2xl font-black text-red-600">{sc.teamEfficiency.teamNeededWithoutAuto}</p>
                  <p className="text-xs text-zinc-500">pessoas sem automação</p>
                </div>
                <div className="text-zinc-300 text-sm">→ ALFREDO IA →</div>
                <div>
                  <p className="text-2xl font-black text-green-600">{sc.teamEfficiency.teamNeededWithAuto}</p>
                  <p className="text-xs text-zinc-500">pessoas com 70% automatizado</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Filosofia do Bilhão ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-primary-50 to-white dark:from-violet-950/20 dark:to-primary-950/10 p-5">
        <div className="flex items-start gap-3">
          <Globe2 className="w-6 h-6 text-violet-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-sm text-violet-800 dark:text-violet-300 mb-2">Filosofia do Bilhão — Software Eats the World</p>
            <div className="grid sm:grid-cols-3 gap-3 text-xs">
              {[
                { icon: '⚙️', title: 'Custo Marginal Zero', desc: 'Vender 1 ativo ou 1.000 deve custar o mesmo. A automação de entrega e pagamento de fornecedor são as alavancas.' },
                { icon: '🔁', title: 'Se aconteceu 2x, vira código', desc: 'Qualquer problema que se repete não é uma tarefa — é uma oportunidade de automação. Briefar o Cursor IA imediatamente.' },
                { icon: '📊', title: 'Você olha para sistemas', desc: 'CEO Arquiteto não resolve problemas. Ele cria sistemas que impedem os problemas de existir.' },
              ].map((p) => (
                <div key={p.title} className="rounded-xl bg-white/60 dark:bg-white/5 p-3">
                  <p className="text-base mb-1">{p.icon}</p>
                  <p className="font-bold text-zinc-700 dark:text-zinc-300 mb-0.5">{p.title}</p>
                  <p className="text-zinc-500 leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
