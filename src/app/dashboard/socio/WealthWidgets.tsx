'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Shield, TrendingUp, AlertTriangle, CheckCircle2, Loader2,
  DollarSign, Zap, Flame, Lock, ArrowUpRight, Settings,
  BarChart2, Target, Sparkles, TriangleAlert,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, ReferenceLine,
} from 'recharts'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────
type DistributableData = {
  avgMonthlyIncome: number; avgMonthlyExpense: number; grossProfit: number
  taxProvision: number; safetyBuffer: number; warFund: number
  reinvestReserve: number; distributable: number; currentBalance: number
  equityEstimate: number; annualEbitda: number; ebitdaMultiple: number
  aiSuggestion: string | null
  layers: { label: string; amount: number; description: string; level: number; color: string }[]
  config: { safetyBufferMonths: number; warFundAmount: number; taxProvisionPct: number; reinvestPct: number; ebitdaMultiple: number; revenueTarget: number }
}

type ProjectionData = {
  currentRevenue: number; currentProfit: number; currentEquity: number; currentPatrimonio: number
  realGrowthRatePct: number
  history: { month: string; revenue: number; expense: number; profit: number }[]
  scenarios: {
    conservative: { rate: number; points: { month: number; value: number }[]; timeline: { label: string; value: number; monthsToReach: number | null; alreadyReached: boolean }[] }
    base:         { rate: number; points: { month: number; value: number }[]; timeline: { label: string; value: number; monthsToReach: number | null; alreadyReached: boolean }[] }
    aggressive:   { rate: number; points: { month: number; value: number }[]; timeline: { label: string; value: number; monthsToReach: number | null; alreadyReached: boolean }[] }
  }
  milestones: { label: string; value: number; monthsBase: number | null; monthsConservative: number | null; monthsAggressive: number | null }[]
  config: { ebitdaMultiple: number; revenueTarget: number }
}

type CostAudit = {
  monthlyRevenue: number; totalCurrent: number; totalPrevious: number
  totalGrowthPct: number; costRevenueRatio: number | null
  alertCount: number; aiAuditReport: string | null
  alerts: { category: string; current: number; previous: number; changePct: number; revenuePct: number; alert: string; suggestion: string }[]
  analysis: { category: string; current: number; previous: number; changePct: number; revenuePct: number; alert: string }[]
}

type CompanyConfig = {
  safetyBufferMonths: number; warFundAmount: number; taxProvisionPct: number
  reinvestPct: number; ebitdaMultiple: number; revenueTarget: number
}

// ─────────────────────────────────────────────────────────────────────────────
const BRL   = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const BRLM  = (v: number) => v >= 1e9 ? `R$ ${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `R$ ${(v / 1e6).toFixed(1)}M` : BRL(v)
const monthLabel = (m: number | null) => m === null ? '∞' : m === 0 ? 'Já atingido' : `${m} meses${m < 12 ? '' : ` (${(m / 12).toFixed(1)} anos)`}`

const LAYER_COLORS: Record<string, string> = {
  red: 'bg-red-500', orange: 'bg-orange-400', amber: 'bg-amber-400',
  yellow: 'bg-yellow-400', green: 'bg-green-500',
}
const LAYER_TEXT: Record<string, string> = {
  red: 'text-red-600', orange: 'text-orange-600', amber: 'text-amber-600',
  yellow: 'text-yellow-600', green: 'text-green-600',
}

// ─────────────────────────────────────────────────────────────────────────────
// Caixa Forte Widget
// ─────────────────────────────────────────────────────────────────────────────

export function CaixaForteWidget({ onRequestTransfer }: { onRequestTransfer: (amount: number) => void }) {
  const [data,     setData]     = useState<DistributableData | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [showCfg,  setShowCfg]  = useState(false)
  const [cfg,      setCfg]      = useState<CompanyConfig | null>(null)
  const [saving,   setSaving]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/socio/distributable')
    if (r.ok) { const d = await r.json(); setData(d); setCfg(d.config) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const saveCfg = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    await fetch('/api/admin/company-config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) })
    setSaving(false); setShowCfg(false); load()
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>
  if (!data) return null

  const hasDistributable = data.distributable > 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-black flex items-center gap-2"><Lock className="w-4 h-4 text-amber-500" />Caixa Forte — Hierarquia de Reservas</h3>
        <button onClick={() => setShowCfg((v) => !v)} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
          <Settings className="w-3.5 h-3.5" />Configurar
        </button>
      </div>

      {/* Formulário de configuração */}
      {showCfg && cfg && (
        <form onSubmit={saveCfg} className="rounded-2xl border border-amber-200 bg-amber-50/40 dark:bg-amber-950/10 p-4 space-y-3">
          <p className="text-xs font-bold text-amber-700">⚙️ Parâmetros do Caixa Forte</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {([
              ['safetyBufferMonths', 'Reserva Operação (meses)', 'number'],
              ['taxProvisionPct',    'Provisão Impostos (%)',    'number'],
              ['reinvestPct',        'Reinvestimento Mín. (%)', 'number'],
              ['warFundAmount',      'Fundo de Guerra (R$)',     'number'],
              ['ebitdaMultiple',     'Múltiplo EBITDA',          'number'],
              ['revenueTarget',      'Meta de Receita (R$)',     'number'],
            ] as [keyof CompanyConfig, string, string][]).map(([k, l]) => (
              <div key={k}>
                <label className="text-xs font-bold mb-1 block">{l}</label>
                <input type="number" step="any" value={cfg[k] ?? ''} onChange={(e) => setCfg((c) => c ? { ...c, [k]: parseFloat(e.target.value) } : c)} className="input-field text-sm" />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary text-sm flex items-center gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}Salvar
            </button>
            <button type="button" onClick={() => setShowCfg(false)} className="btn-secondary text-sm">Cancelar</button>
          </div>
        </form>
      )}

      {/* Pirâmide de reservas */}
      <div className="space-y-2">
        {data.layers.map((layer, i) => {
          const total = data.layers.reduce((s, l) => s + l.amount, 0)
          const pct   = total > 0 ? (layer.amount / total) * 100 : 0
          return (
            <div key={i} className={`rounded-xl border p-3 ${i === data.layers.length - 1 ? 'border-green-300 bg-green-50 dark:bg-green-950/10' : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-10 rounded-full shrink-0 ${LAYER_COLORS[layer.color] ?? 'bg-zinc-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-sm">{layer.label}</p>
                    <p className={`font-black text-sm ${LAYER_TEXT[layer.color] ?? 'text-zinc-600'}`}>{BRL(layer.amount)}</p>
                  </div>
                  <p className="text-[10px] text-zinc-400 truncate">{layer.description}</p>
                  <div className="h-1 bg-zinc-100 dark:bg-zinc-700 rounded-full mt-1.5 overflow-hidden">
                    <div className={`h-full ${LAYER_COLORS[layer.color]} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Botão de retirada */}
      {hasDistributable ? (
        <div className="rounded-2xl border-2 border-green-300 bg-green-50 dark:bg-green-950/10 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />
            <div>
              <p className="font-black text-green-700">💰 Disponível para Retirada de Lucro</p>
              <p className="text-2xl font-black text-green-600">{BRL(data.distributable)}</p>
            </div>
          </div>
          <button onClick={() => onRequestTransfer(Math.round(data.distributable))}
            className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-black text-sm flex items-center justify-center gap-2 transition-colors">
            <ArrowUpRight className="w-4 h-4" />Retirar {BRL(data.distributable)} para Minha Holding
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 dark:bg-zinc-800/30 p-3 flex items-center gap-2 text-xs text-zinc-500">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          Sem saldo distribuível no momento. Aumente a receita ou aguarde o acúmulo das reservas.
        </div>
      )}

      {/* KPIs complementares */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-3 text-center">
          <p className="font-black text-sm">{BRL(data.equityEstimate)}</p>
          <p className="text-zinc-400">Equity Estimada ({data.ebitdaMultiple}× EBITDA)</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-3 text-center">
          <p className="font-black text-sm">{BRL(data.annualEbitda)}</p>
          <p className="text-zinc-400">EBITDA Anual (base)</p>
        </div>
      </div>

      {/* ALFREDO IA Sugestão */}
      {data.aiSuggestion && (
        <div className="rounded-2xl border border-primary-200 bg-gradient-to-br from-primary-50 to-primary-50/20 dark:from-primary-950/20 dark:to-transparent p-4 flex gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-xs text-primary-600 mb-1">ALFREDO IA — Orientação de Aporte</p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{data.aiSuggestion}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Projeção de Bilhão
// ─────────────────────────────────────────────────────────────────────────────

export function ProjecaoBilhaoWidget() {
  const [data,    setData]    = useState<ProjectionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [scenario, setScenario] = useState<'conservative' | 'base' | 'aggressive'>('base')

  useEffect(() => {
    fetch('/api/socio/projection').then((r) => r.json()).then(setData).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>
  if (!data) return null

  const sc = data.scenarios[scenario]
  // Usa apenas 24 meses para o gráfico
  const chartData = sc.points.slice(0, 25).map((p) => ({
    mes: `M${p.month}`,
    receita: Math.round(p.value),
    bilhao: 83_333_333,
    um_milhao: 1_000_000,
  }))

  const SCENARIO_CONFIG = {
    conservative: { label: 'Conservador', color: '#6366f1', rate: sc.rate },
    base:         { label: 'Base',        color: '#22c55e', rate: sc.rate },
    aggressive:   { label: 'Agressivo',   color: '#f59e0b', rate: sc.rate },
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-black flex items-center gap-2"><Flame className="w-4 h-4 text-amber-500" />Projeção de Bilhão</h3>
        <div className="flex gap-1">
          {(Object.entries(SCENARIO_CONFIG) as [string, typeof SCENARIO_CONFIG.base][]).map(([k, c]) => (
            <button key={k} onClick={() => setScenario(k as 'conservative' | 'base' | 'aggressive')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${scenario === k ? 'text-white border-transparent' : 'border-zinc-200 dark:border-zinc-700 text-zinc-500'}`}
              style={scenario === k ? { backgroundColor: c.color } : {}}>
              {c.label} ({data.scenarios[k as 'conservative' | 'base' | 'aggressive'].rate}%/mês)
            </button>
          ))}
        </div>
      </div>

      {/* KPIs atuais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
        {[
          { label: 'Receita Atual',   val: BRLM(data.currentRevenue),    color: 'text-green-600' },
          { label: 'Equity Empresa',  val: BRLM(data.currentEquity),     color: 'text-primary-600' },
          { label: 'Patrimônio PF',   val: BRLM(data.currentPatrimonio), color: 'text-amber-600' },
          { label: 'Crescimento Real',val: `${data.realGrowthRatePct}%/mês`, color: data.realGrowthRatePct > 0 ? 'text-green-600' : 'text-red-500' },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-2">
            <p className={`font-black ${k.color}`}>{k.val}</p>
            <p className="text-zinc-400">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Gráfico de projeção */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-4">
        <p className="text-xs font-bold text-zinc-500 uppercase mb-3">Projeção de Receita — 24 meses (Cenário: {SCENARIO_CONFIG[scenario].label})</p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradScenario" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={SCENARIO_CONFIG[scenario].color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={SCENARIO_CONFIG[scenario].color} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 10 }} interval={3} />
            <YAxis tickFormatter={(v) => BRLM(v)} tick={{ fontSize: 10 }} width={60} />
            <Tooltip formatter={(v: number) => [BRLM(v), '']} labelFormatter={(l) => `Mês ${l.toString().replace('M', '')}`} />
            <ReferenceLine y={1_000_000}  stroke="#6366f1" strokeDasharray="4 2" label={{ value: 'R$1M', position: 'right', fontSize: 9, fill: '#6366f1' }} />
            <ReferenceLine y={83_333_333} stroke="#ef4444" strokeDasharray="4 2" label={{ value: '1B/ano', position: 'right', fontSize: 9, fill: '#ef4444' }} />
            <Area type="monotone" dataKey="receita" stroke={SCENARIO_CONFIG[scenario].color} strokeWidth={2} fill="url(#gradScenario)" name="Receita Projetada" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Marcos do cenário */}
      <div className="space-y-1.5">
        <p className="text-xs font-bold text-zinc-500 uppercase">Marcos — Cenário {SCENARIO_CONFIG[scenario].label}</p>
        {data.milestones.map((m) => {
          const months = scenario === 'base' ? m.monthsBase : scenario === 'conservative' ? m.monthsConservative : m.monthsAggressive
          return (
            <div key={m.label} className="rounded-xl border border-zinc-100 dark:border-zinc-700 bg-white dark:bg-ads-dark-card px-4 py-2.5 flex items-center gap-3">
              <Target className="w-4 h-4 text-primary-500 shrink-0" />
              <div className="flex-1">
                <p className="font-bold text-sm">{m.label}</p>
                <p className="text-xs text-zinc-400">{BRLM(m.value)}/mês</p>
              </div>
              <span className={`px-3 py-1 rounded-lg text-xs font-bold ${months === 0 ? 'bg-green-100 text-green-700' : months !== null && months <= 24 ? 'bg-primary-100 text-primary-700' : 'bg-zinc-100 text-zinc-500'}`}>
                {monthLabel(months)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Auditor de Custos
// ─────────────────────────────────────────────────────────────────────────────

export function CostAuditorWidget() {
  const [data,    setData]    = useState<CostAudit | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    fetch('/api/admin/cost-audit').then((r) => r.json()).then(setData).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>
  if (!data) return null

  const alertColor = (a: string) => a === 'HIGH_INCREASE' ? 'text-red-600 bg-red-50 border-red-200' : a === 'HIGH_COST' ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-green-600 bg-green-50 border-green-200'
  const displayed = showAll ? data.analysis : data.analysis.slice(0, 6)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-black flex items-center gap-2"><BarChart2 className="w-4 h-4 text-red-500" />Auditor de Custos — ALFREDO IA</h3>
        {data.alertCount > 0 && (
          <span className="px-3 py-1 rounded-lg bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1">
            <TriangleAlert className="w-3 h-3" />{data.alertCount} alerta{data.alertCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {[
          { label: 'Total Despesas',    val: BRL(data.totalCurrent),    color: 'text-red-600' },
          { label: 'Vs. Mês Anterior',  val: `${data.totalGrowthPct > 0 ? '+' : ''}${data.totalGrowthPct.toFixed(1)}%`, color: data.totalGrowthPct > 15 ? 'text-red-600' : data.totalGrowthPct > 0 ? 'text-amber-600' : 'text-green-600' },
          { label: 'Custo/Receita',     val: data.costRevenueRatio != null ? `${data.costRevenueRatio.toFixed(0)}%` : 'N/A', color: (data.costRevenueRatio ?? 0) > 70 ? 'text-red-600' : 'text-zinc-600' },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-2">
            <p className={`font-black ${k.color}`}>{k.val}</p>
            <p className="text-zinc-400">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Relatório ALFREDO IA */}
      {data.aiAuditReport && (
        <div className="rounded-2xl border border-primary-200 bg-primary-50/40 dark:bg-primary-950/10 p-4 flex gap-3">
          <Sparkles className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" />
          <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-line">{data.aiAuditReport}</p>
        </div>
      )}

      {/* Análise por categoria */}
      <div className="space-y-1.5">
        {displayed.map((c) => {
          const isAlert = c.alert !== 'OK'
          return (
            <div key={c.category} className={`rounded-xl border px-3 py-2.5 ${isAlert ? alertColor(c.alert) : 'border-zinc-100 dark:border-zinc-700 bg-white dark:bg-ads-dark-card'}`}>
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm">{c.category}</p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-zinc-400">{BRL(c.previous)} → </span>
                  <span className="font-black">{BRL(c.current)}</span>
                  <span className={`font-bold ${c.changePct > 20 ? 'text-red-600' : c.changePct > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                    {c.changePct > 0 ? '+' : ''}{c.changePct.toFixed(0)}%
                  </span>
                </div>
              </div>
              {/* Barra de progresso relativa à maior categoria */}
              <div className="h-1 bg-zinc-100 dark:bg-zinc-700 rounded-full mt-1.5 overflow-hidden">
                <div className={`h-full rounded-full ${c.alert === 'HIGH_INCREASE' ? 'bg-red-400' : c.alert === 'HIGH_COST' ? 'bg-amber-400' : 'bg-zinc-300'}`}
                  style={{ width: `${Math.min(100, c.revenuePct * 2)}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      {data.analysis.length > 6 && (
        <button onClick={() => setShowAll((v) => !v)} className="w-full text-xs text-zinc-400 hover:text-zinc-600 font-bold py-2">
          {showAll ? 'Mostrar menos' : `Ver mais ${data.analysis.length - 6} categorias`}
        </button>
      )}
    </div>
  )
}
