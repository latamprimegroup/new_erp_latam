'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  Package,
  RefreshCw,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface GatewayRevenue {
  gateway:      string
  label:        string
  currency:     string
  amountBrl:    number
  amountNative: number
  txCount:      number
  spreadPct:    number
  connected:    boolean
  error?:       string | null
}

interface TesourariaData {
  generatedAt: string
  period:      { days: number; since: string }
  fx:          { usdToBrl: number; updatedAt: string }
  liquidity: {
    totalLiquidityBrl:   number
    mercuryAvailableBrl: number
    mercuryAvailableUsd: number
    mercuryCurrentUsd:   number
  }
  revenue: {
    totalGrossBrl:   number
    totalNetBrl:     number
    totalSpreadCost: number
    spreadCostPct:   number
    byGateway:       GatewayRevenue[]
  }
  projection: {
    dailyAvgBrl:   number
    annualRunRate: number
    metaAnual:     number
    progressPct:   number
    daysToMeta:    number | null
  }
  stock: {
    currentAvailable: number
    dailyAvgUnits:    number
    daysOfStock:      number
    alert:            boolean
  }
  recentPixEvents: Array<{
    id: string; txid: string; amount: number | null
    status: string; flowType: string | null; processedAt: string | null; errorMsg: string | null
  }>
  mercuryRecentTxs: Array<{
    id: string; amount: number; createdAt: string
    counterpartyName: string | null; kind: string; note: string | null
  }>
  utmBreakdown: Array<{ source: string; count: number; revenueBrl: number }>
}

interface DailyPoint {
  date:    string
  inter:   number
  mercury: number
  kast:    number
  total:   number
}

interface FunnelData {
  funnel: {
    generated:        number
    paid:             number
    expired:          number
    conversionPct:    number
    dropOffPct:       number
    avgTicketBrl:     number
    avgConversionHours: number | null
  }
  byListing: Array<{
    listingId:     string
    title:         string
    generated:     number
    paid:          number
    conversionPct: number
    revenueBrl:    number
  }>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const BRLC = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })
const USD_FMT = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function formatK(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}k`
  return String(Math.round(v))
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const PIX_STATUS_COLOR: Record<string, string> = {
  PROCESSED: 'text-emerald-400',
  DUPLICATE: 'text-amber-400',
  NOT_FOUND: 'text-orange-400',
  ERROR:     'text-red-400',
}

// ─── Gráfico de barras simples (sem recharts) ─────────────────────────────────

function MiniBarChart({ series, days }: { series: DailyPoint[]; days: number }) {
  const visible = series.slice(-days)
  const maxTotal = Math.max(...visible.map((d) => d.total), 1)

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-0.5 h-32">
        {visible.map((d) => {
          const interH   = (d.inter   / maxTotal) * 100
          const mercuryH = (d.mercury / maxTotal) * 100
          const kastH    = (d.kast    / maxTotal) * 100
          return (
            <div
              key={d.date}
              className="flex-1 flex flex-col justify-end group relative"
              title={`${d.date}: ${BRL.format(d.total)}`}
            >
              <div className="w-full rounded-t-sm overflow-hidden flex flex-col justify-end" style={{ height: `${Math.max(interH + mercuryH + kastH, 2)}%` }}>
                {kastH > 0    && <div className="w-full" style={{ height: `${kastH / (interH + mercuryH + kastH) * 100}%`, background: '#a855f7' }} />}
                {mercuryH > 0 && <div className="w-full" style={{ height: `${mercuryH / (interH + mercuryH + kastH) * 100}%`, background: '#3b82f6' }} />}
                {interH > 0   && <div className="w-full" style={{ height: `${interH / (interH + mercuryH + kastH) * 100}%`, background: '#10b981' }} />}
              </div>
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[10px] whitespace-nowrap">
                <p className="text-zinc-300 font-semibold">{d.date.slice(5)}</p>
                {d.inter   > 0 && <p className="text-emerald-400">PIX: {BRL.format(d.inter)}</p>}
                {d.mercury > 0 && <p className="text-blue-400">Mercury: {BRL.format(d.mercury)}</p>}
                {d.kast    > 0 && <p className="text-purple-400">USDT: {BRL.format(d.kast)}</p>}
              </div>
            </div>
          )
        })}
      </div>
      {/* Labels eixo X — apenas alguns */}
      <div className="flex justify-between text-[9px] text-zinc-600">
        {[visible[0], visible[Math.floor(visible.length / 2)], visible[visible.length - 1]].map((d) => (
          d ? <span key={d.date}>{d.date.slice(5)}</span> : null
        ))}
      </div>
      <div className="flex gap-3 text-[10px]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />PIX</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500 inline-block" />Mercury</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-purple-500 inline-block" />USDT</span>
      </div>
    </div>
  )
}

// ─── Barra de progresso da meta ────────────────────────────────────────────────

function GoalBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="space-y-1">
      <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-zinc-500">
        <span>R$ 0</span>
        <span className="font-semibold text-zinc-300">{pct}% da meta</span>
        <span>R$ 10M</span>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function TesourariaClient() {
  const [data, setData]     = useState<TesourariaData | null>(null)
  const [daily, setDaily]   = useState<DailyPoint[]>([])
  const [funnel, setFunnel] = useState<FunnelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays]     = useState(30)
  const [tab, setTab]       = useState<'visao-geral' | 'fluxo' | 'funil' | 'atribuicao'>('visao-geral')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch(`/api/admin/tesouraria?days=${days}`,              { cache: 'no-store' }),
        fetch(`/api/admin/tesouraria/daily?days=${days}`,        { cache: 'no-store' }),
        fetch(`/api/admin/tesouraria/checkout-funnel?days=${days}`, { cache: 'no-store' }),
      ])
      if (r1.ok) setData(await r1.json() as TesourariaData)
      if (r2.ok) setDaily((await r2.json() as { series: DailyPoint[] }).series)
      if (r3.ok) setFunnel(await r3.json() as FunnelData)
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { load() }, [load])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    )
  }

  const rev  = data?.revenue
  const proj = data?.projection
  const stk  = data?.stock
  const liq  = data?.liquidity
  const maxGateway = Math.max(...(rev?.byGateway.map((g) => g.amountBrl) ?? [1]), 1)

  return (
    <div className="space-y-5">

      {/* Controles */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${days === d ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
            >
              {d}d
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {data?.fx && (
            <span>USD/BRL: <strong className="text-zinc-200">{data.fx.usdToBrl.toFixed(4)}</strong></span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* ── UNIFIED LIQUIDITY HEADER ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Card principal — Liquidez Total */}
        <div className="sm:col-span-1 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wide">Liquidez Atual</p>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-3xl font-black text-white">
            {liq ? BRL.format(liq.mercuryAvailableBrl) : '—'}
          </p>
          <p className="text-xs text-zinc-500">
            Mercury: {liq ? USD_FMT.format(liq.mercuryAvailableUsd) : '—'} disponível
          </p>
          {data?.generatedAt && (
            <p className="text-[10px] text-zinc-600">Atualizado {formatDate(data.generatedAt)}</p>
          )}
        </div>

        {/* Sub-cards por canal */}
        <div className="sm:col-span-2 grid grid-cols-3 gap-3">
          {rev?.byGateway.map((g) => (
            <div
              key={g.gateway}
              className={`rounded-2xl border p-4 space-y-1.5 ${
                !g.connected ? 'border-zinc-700 bg-zinc-900/20 opacity-70'
                  : g.amountBrl === 0 ? 'border-zinc-800 bg-zinc-900/40'
                  : 'border-zinc-700 bg-zinc-800/40'
              }`}
            >
              <p className="text-[11px] font-semibold text-zinc-400">{g.label}</p>
              <p className="text-xl font-black text-white">
                {g.currency === 'BRL'
                  ? BRL.format(g.amountNative)
                  : USD_FMT.format(g.amountNative)
                }
              </p>
              <p className="text-[10px] text-zinc-600">
                ≈ {BRL.format(g.amountBrl)} · {g.txCount} tx
              </p>
              {g.spreadPct > 0 && (
                <p className="text-[10px] text-orange-400">
                  Spread: {g.spreadPct}%
                </p>
              )}
              {!g.connected && <p className="text-[10px] text-red-400">⚠ Offline</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Alerta de Estoque */}
      {stk?.alert && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-300">⚠️ Estoque Crítico</p>
            <p className="text-xs text-zinc-400">
              Apenas <strong>{stk.currentAvailable}</strong> ativos disponíveis ({stk.daysOfStock}d de estoque).
              Taxa de consumo: <strong>{stk.dailyAvgUnits}</strong> unidades/dia.
            </p>
          </div>
        </div>
      )}

      {/* Projeção de Meta R$10M */}
      {proj && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" /> Projeção Anual — Meta R$ 10M
              </p>
              <p className="text-3xl font-black text-white mt-1">
                {BRL.format(proj.annualRunRate)}
                <span className="text-sm text-zinc-500 font-normal ml-2">/ ano projetado</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-500">Média diária</p>
              <p className="text-lg font-bold text-emerald-400">{BRLC.format(proj.dailyAvgBrl)}</p>
              {proj.daysToMeta != null && (
                <p className="text-[10px] text-zinc-600 mt-0.5">
                  {proj.daysToMeta > 0 ? `${proj.daysToMeta} dias para a meta` : 'Meta atingida!'}
                </p>
              )}
            </div>
          </div>
          <GoalBar pct={proj.progressPct} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800 pb-2">
        {([
          { id: 'visao-geral', label: 'Visão Geral' },
          { id: 'fluxo',       label: '📈 Fluxo Diário' },
          { id: 'funil',       label: '🔻 Funil PIX' },
          { id: 'atribuicao',  label: '📍 Origem Tráfego' },
        ] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${tab === t.id ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Visão Geral ──────────────────────────────────────────────────── */}
      {tab === 'visao-geral' && (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: <TrendingUp className="w-4 h-4 text-emerald-400" />, label: 'Receita Bruta',  value: BRL.format(rev?.totalGrossBrl ?? 0) },
              { icon: <CheckCircle2 className="w-4 h-4 text-blue-400" />,  label: 'Receita Líquida', value: BRL.format(rev?.totalNetBrl ?? 0) },
              { icon: <ArrowUpRight className="w-4 h-4 text-orange-400" />, label: 'Spread Câmbio', value: BRLC.format(rev?.totalSpreadCost ?? 0) },
              { icon: <Package className="w-4 h-4 text-zinc-400" />,        label: 'Estoque',       value: `${stk?.currentAvailable ?? 0} ativos` },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 flex items-center gap-3">
                {k.icon}
                <div>
                  <p className="text-[10px] text-zinc-500">{k.label}</p>
                  <p className="text-sm font-bold text-white">{k.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Breakdown por gateway */}
          <div className="rounded-xl border border-zinc-800 p-4 space-y-3">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Faturamento por Canal</h3>
            {rev?.byGateway.map((g) => (
              <div key={g.gateway} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-300">{g.label}</span>
                  <div className="text-right">
                    <span className="font-bold text-white">{BRL.format(g.amountBrl)}</span>
                    {g.spreadPct > 0 && (
                      <span className="text-orange-400 text-xs ml-2">
                        −{BRLC.format(g.amountBrl * g.spreadPct / 100)} spread
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${g.gateway === 'INTER' ? 'bg-emerald-500' : g.gateway === 'MERCURY' ? 'bg-blue-500' : 'bg-purple-500'}`}
                    style={{ width: `${maxGateway > 0 ? (g.amountBrl / maxGateway) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Últimos eventos PIX */}
          <div className="rounded-xl border border-zinc-800 p-4 space-y-2">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide flex items-center justify-between">
              Últimos Eventos PIX Inter
              <a href="/dashboard/admin/inter-health" className="text-zinc-600 hover:text-zinc-400 flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> Health
              </a>
            </h3>
            {data?.recentPixEvents.length === 0 ? (
              <p className="text-zinc-600 text-xs">Nenhum evento registrado.</p>
            ) : (
              data?.recentPixEvents.map((ev) => (
                <div key={ev.id} className="flex items-center gap-2 text-xs">
                  <span className={`font-bold shrink-0 ${PIX_STATUS_COLOR[ev.status] ?? 'text-zinc-400'}`}>{ev.status}</span>
                  {ev.amount != null && (
                    <span className="text-white font-semibold">{BRLC.format(ev.amount)}</span>
                  )}
                  <span className="text-zinc-600 truncate font-mono">{ev.txid.slice(0, 16)}…</span>
                  <span className="text-zinc-600 shrink-0 ml-auto">{formatDate(ev.processedAt)}</span>
                </div>
              ))
            )}
          </div>

          {/* Últimas transações Mercury */}
          {data?.mercuryRecentTxs && data.mercuryRecentTxs.length > 0 && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
              <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wide flex items-center justify-between">
                Últimas Entradas Mercury (USD)
                <a href="/dashboard/admin/mercury-health" className="text-zinc-600 hover:text-zinc-400 flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Health
                </a>
              </h3>
              {data.mercuryRecentTxs.map((tx) => (
                <div key={tx.id} className="flex items-center gap-2 text-xs">
                  <span className="text-emerald-400 font-bold shrink-0">{USD_FMT.format(tx.amount)}</span>
                  <span className="text-zinc-300 truncate">{tx.counterpartyName ?? tx.kind}</span>
                  <span className="text-zinc-600 shrink-0 ml-auto">{formatDate(tx.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Fluxo Diário ────────────────────────────────────────────────── */}
      {tab === 'fluxo' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 p-4 space-y-4">
            <h3 className="text-sm font-bold text-white">Faturamento Diário por Canal (últimos {days} dias)</h3>
            {daily.length > 0 ? (
              <MiniBarChart series={daily} days={days} />
            ) : (
              <p className="text-zinc-500 text-sm text-center py-8">Carregando dados...</p>
            )}
          </div>

          {/* Tabela de maiores dias */}
          <div className="rounded-xl border border-zinc-800 p-4 space-y-2">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Top 5 Dias por Faturamento</h3>
            {[...daily].sort((a, b) => b.total - a.total).slice(0, 5).map((d) => (
              <div key={d.date} className="flex items-center gap-3 text-sm">
                <span className="text-zinc-400 font-mono w-20 shrink-0">{d.date.slice(5)}</span>
                <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(d.total / Math.max(...daily.map((x) => x.total), 1)) * 100}%` }} />
                </div>
                <span className="text-white font-bold w-28 text-right shrink-0">{BRL.format(d.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB: Funil PIX ───────────────────────────────────────────────────── */}
      {tab === 'funil' && funnel && (
        <div className="space-y-4">
          {/* Funil global */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'PIX Gerados',    value: funnel.funnel.generated, color: 'text-zinc-300' },
              { label: 'PIX Pagos',      value: funnel.funnel.paid,      color: 'text-emerald-400' },
              { label: 'Expirados',      value: funnel.funnel.expired,   color: 'text-red-400' },
              { label: 'Conversão',      value: `${funnel.funnel.conversionPct}%`, color: funnel.funnel.conversionPct >= 50 ? 'text-emerald-400' : 'text-amber-400', isStr: true },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <p className="text-[10px] text-zinc-500">{k.label}</p>
                <p className={`text-2xl font-black ${k.color}`}>{(k as { isStr?: boolean }).isStr ? k.value : k.value}</p>
              </div>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-zinc-800 p-4 space-y-1">
              <p className="text-[10px] text-zinc-500">Ticket Médio</p>
              <p className="text-xl font-black text-white">{BRLC.format(funnel.funnel.avgTicketBrl)}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 p-4 space-y-1">
              <p className="text-[10px] text-zinc-500">Tempo Médio de Conversão</p>
              <p className="text-xl font-black text-white">
                {funnel.funnel.avgConversionHours != null ? `${funnel.funnel.avgConversionHours}h` : '—'}
              </p>
            </div>
          </div>

          {/* Funil por listing */}
          <div className="rounded-xl border border-zinc-800 overflow-hidden">
            <div className="bg-zinc-800/50 px-4 py-2.5">
              <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Conversão por Listing</p>
            </div>
            <div className="divide-y divide-zinc-800">
              {funnel.byListing.map((l) => (
                <div key={l.listingId} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{l.title}</p>
                    <p className="text-[11px] text-zinc-500">{l.generated} gerados · {l.paid} pagos</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${l.conversionPct >= 50 ? 'text-emerald-400' : l.conversionPct >= 30 ? 'text-amber-400' : 'text-red-400'}`}>
                      {l.conversionPct}%
                    </p>
                    <p className="text-[11px] text-zinc-500">{BRL.format(l.revenueBrl)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {funnel.funnel.dropOffPct > 50 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-center gap-3">
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-300">
                <strong>Drop-off de {funnel.funnel.dropOffPct}%</strong> — taxa de conversão abaixo do esperado.
                Considere revisar o fluxo de checkout ou testar outro gateway.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Atribuição de Tráfego ───────────────────────────────────────── */}
      {tab === 'atribuicao' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 overflow-hidden">
            <div className="bg-zinc-800/50 px-4 py-2.5">
              <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
                Origem do Tráfego — UTM Source (últimos {days} dias)
              </p>
            </div>
            {(data?.utmBreakdown.length ?? 0) === 0 ? (
              <p className="px-4 py-8 text-zinc-500 text-sm text-center">Nenhum dado de UTM no período.</p>
            ) : (
              <div className="divide-y divide-zinc-800">
                {data?.utmBreakdown.map((u, idx) => {
                  const maxRev = Math.max(...(data.utmBreakdown.map((x) => x.revenueBrl)), 1)
                  return (
                    <div key={u.source} className="px-4 py-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-600 text-xs font-mono">#{idx + 1}</span>
                          <p className="text-sm font-semibold text-white">{u.source}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-emerald-400">{BRL.format(u.revenueBrl)}</p>
                          <p className="text-[11px] text-zinc-500">{u.count} conversões</p>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${(u.revenueBrl / maxRev) * 100}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <p className="text-xs text-zinc-600 text-center">
            Para rastrear Google Ads vs TikTok, adicione utm_source=google ou utm_source=tiktok no link de checkout.
          </p>
        </div>
      )}

    </div>
  )
}
