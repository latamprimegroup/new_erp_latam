'use client'

/**
 * Revenue8dClient — Motor de 8 Dígitos
 *
 * Dashboard estratégico do CEO para visualização do caminho para R$ 10M+/ano.
 * Consolida todas as fontes de receita em uma visão única:
 *   · Transacional (Ativos / WhatsApp)
 *   · Recorrência (SaaS / Mentoria / Infra)
 *   · Spend Fee (% sobre gasto do cliente — Rental/Infra)
 *
 * Breakdown por: Perfil de Cliente · Gateway · Moeda
 */
import { useState, useEffect, useCallback } from 'react'
import { PROFILE_THEMES, PROFILE_TYPE_LABELS } from '@/lib/client-profile-config'
import type { ClientProfileType } from '@/lib/client-profile-config'

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = '30d' | '90d' | '12m' | 'ytd'

type OverviewData = {
  period:      string
  periodStart: string
  summary: {
    totalRevenueBrl:      number
    totalProfitBrl:       number
    totalRevenueUsd:      number
    marginPct:            number
    mrrBrl:               number
    arrBrl:               number
    annualizedRunRateBrl: number
    activeSubscriptions:  number
    transactionCount:     number
    dataSource:           string
  }
  byType:     Array<{ type: string; revenue: number; profit: number; count: number }>
  byGateway:  Array<{ gateway: string; revenue: number; count: number }>
  byCurrency: Array<{ currency: string; amount: number }>
  byProfile:  Array<{ profileType: string; revenue: number; profit: number; count: number }>
  mrr: {
    total:     number
    byProfile: Array<{ profileType: string; mrr: number; count: number }>
  }
}

// ─── Helpers visuais ──────────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const PCT = (v: number) => `${v.toFixed(1)}%`

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, background: color }} />
    </div>
  )
}

function KpiCard({
  label, value, sub, accent, badge,
}: { label: string; value: string; sub?: string; accent?: string; badge?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/70 p-5 space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">{label}</p>
        {badge && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-violet-600/20 text-violet-300">
            {badge}
          </span>
        )}
      </div>
      <p className="text-2xl font-black tracking-tight" style={accent ? { color: accent } : { color: 'white' }}>
        {value}
      </p>
      {sub && <p className="text-xs text-zinc-500">{sub}</p>}
    </div>
  )
}

const TYPE_LABELS: Record<string, string> = {
  ASSET_SALE:       '💎 Venda de Ativo',
  SUBSCRIPTION_FEE: '🔄 Mensalidade SaaS',
  SPEND_FEE:        '📊 % Sobre Spend',
  SETUP_FEE:        '⚙️ Setup Único',
  MENTORSHIP:       '🎓 Mentoria High-Ticket',
  REFUND:           '↩️ Estorno',
}

const GATEWAY_LABELS: Record<string, string> = {
  INTER:      '🏦 Banco Inter (PIX)',
  KAST:       '₿ Kast (Cripto)',
  MERCURY:    '🇺🇸 Mercury (USD/LLC)',
  STRIPE:     '💳 Stripe (Cartão)',
  PIX_MANUAL: '📱 PIX Manual',
  OTHER:      '— Outro',
}

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: '30d',  label: 'Últimos 30 dias' },
  { value: '90d',  label: 'Últimos 90 dias' },
  { value: '12m',  label: 'Últimos 12 meses' },
  { value: 'ytd',  label: 'Ano atual (YTD)' },
]

// ─── Types ROI + Attribution ──────────────────────────────────────────────────

type ChannelBreakdown = {
  source:       string
  medium:       string
  touchpoints:  number
  revenueBrl:   number
  netProfitBrl: number
  campaigns:    string[]
  firstTouch:   string
  lastTouch:    string
}

type AttributionData = {
  totalTouchpoints:  number
  totalRevenueBrl:   number
  totalNetProfitBrl: number
  channelBreakdown:  ChannelBreakdown[]
}

const SOURCE_EMOJI: Record<string, string> = {
  facebook: '📘', meta: '📘', instagram: '📷',
  google:   '🎯', youtube: '▶️',
  tiktok:   '🎵', kwai: '📱',
  direto:   '🔗', organic: '🌿', email: '📧',
  whatsapp: '💬',
}

function getSourceEmoji(source: string): string {
  for (const [k, v] of Object.entries(SOURCE_EMOJI)) {
    if (source.toLowerCase().includes(k)) return v
  }
  return '📊'
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function Revenue8dClient() {
  const [period, setPeriod]       = useState<Period>('30d')
  const [data, setData]           = useState<OverviewData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [attrData, setAttrData]   = useState<AttributionData | null>(null)
  const [attrLoading, setAttrLoad] = useState(false)
  const [showAttr, setShowAttr]   = useState(false)

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true)
    const res = await fetch(`/api/admin/revenue-overview?period=${p}`)
    const json = await res.json()
    setData(json)
    setLoading(false)
  }, [])

  const fetchAttribution = useCallback(async () => {
    setAttrLoad(true)
    const res = await fetch('/api/admin/attribution-360?limit=500')
    setAttrData(await res.json().catch(() => null))
    setAttrLoad(false)
    setShowAttr(true)
  }, [])

  useEffect(() => { fetchData(period) }, [period, fetchData])

  const s = data?.summary

  // Barra de progresso para 8 dígitos (R$ 10M)
  const TARGET_8D = 10_000_000
  const runRate   = s?.annualizedRunRateBrl ?? 0
  const progress  = Math.min(100, (runRate / TARGET_8D) * 100)

  const maxProfileRevenue = Math.max(...(data?.byProfile?.map((p) => p.revenue) ?? [1]))
  const maxGatewayRevenue = Math.max(...(data?.byGateway?.map((g) => g.revenue) ?? [1]))

  return (
    <div className="p-4 md:p-6 space-y-8 max-w-6xl mx-auto">

      {/* Header + seletor de período */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Ads Ativos Global</p>
          <h1 className="text-2xl font-black text-white">🎯 Motor de 8 Dígitos</h1>
          <p className="text-zinc-400 text-sm mt-0.5">Consolidação de receita por vertical, gateway e moeda</p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          className="rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 self-start sm:self-auto"
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-60">
          <p className="text-zinc-500 text-sm animate-pulse">Carregando visão de 8 dígitos…</p>
        </div>
      ) : !data ? (
        <p className="text-red-400 text-sm">Erro ao carregar dados.</p>
      ) : (
        <>
          {/* Barra de progresso para R$ 10M */}
          <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/70 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Progresso para os 8 Dígitos — Meta: {BRL.format(TARGET_8D)}/ano
                </p>
                <p className="text-4xl font-black text-white mt-1">
                  {BRL.format(runRate)}
                  <span className="text-base font-normal text-zinc-400 ml-2">/ ano (run rate)</span>
                </p>
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-3xl font-black" style={{ color: progress >= 100 ? '#22c55e' : progress >= 50 ? '#facc15' : '#f97316' }}>
                  {PCT(progress)}
                </p>
                <p className="text-xs text-zinc-600">da meta</p>
              </div>
            </div>
            <div className="h-3 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${progress}%`,
                  background: progress >= 100
                    ? 'linear-gradient(90deg,#22c55e,#16a34a)'
                    : progress >= 50
                      ? 'linear-gradient(90deg,#facc15,#f97316)'
                      : 'linear-gradient(90deg,#f97316,#ef4444)',
                }}
              />
            </div>
            <p className="text-xs text-zinc-600">
              {s?.dataSource === 'checkout_fallback'
                ? '⚠️ Usando dados de checkout como fallback — registre Transactions via webhook para dados precisos.'
                : `✅ ${s?.transactionCount} transações no período · Dados da tabela Transaction`}
            </p>
          </div>

          {/* KPIs principais */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Faturamento (BRL)"
              value={BRL.format(s?.totalRevenueBrl ?? 0)}
              sub={`no período de ${period}`}
              accent="#a78bfa"
            />
            <KpiCard
              label="Lucro Líquido"
              value={BRL.format(s?.totalProfitBrl ?? 0)}
              sub={`Margem: ${PCT(s?.marginPct ?? 0)}`}
              accent="#34d399"
            />
            <KpiCard
              label="MRR (Recorrência)"
              value={BRL.format(s?.mrrBrl ?? 0)}
              sub={`ARR: ${BRL.format(s?.arrBrl ?? 0)}`}
              badge="SaaS"
              accent="#fbbf24"
            />
            <KpiCard
              label="Faturamento USD"
              value={USD.format(s?.totalRevenueUsd ?? 0)}
              sub="Mercury + Kast + Stripe"
              accent="#60a5fa"
            />
          </div>

          {/* Grid 2 colunas */}
          <div className="grid md:grid-cols-2 gap-6">

            {/* Por Perfil de Cliente */}
            <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/70 p-5 space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                🏷️ Receita por Perfil de Cliente
              </h2>
              <div className="space-y-3">
                {(data.byProfile.length === 0
                  ? [{ profileType: 'TRADER_WHATSAPP', revenue: 0, profit: 0, count: 0 }]
                  : data.byProfile
                ).sort((a, b) => b.revenue - a.revenue).map((p) => {
                  const theme = PROFILE_THEMES[p.profileType as ClientProfileType]
                  const label = PROFILE_TYPE_LABELS[p.profileType as ClientProfileType] ?? p.profileType
                  // MRR da assinatura desse perfil
                  const mrrEntry = data.mrr.byProfile.find((m) => m.profileType === p.profileType)
                  return (
                    <div key={p.profileType} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span>{theme?.emoji ?? '📦'}</span>
                          <span className="text-sm font-semibold text-white">{label}</span>
                          {mrrEntry && (
                            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-amber-600/20 text-amber-400">
                              +{BRL.format(mrrEntry.mrr)}/mês
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-white">{BRL.format(p.revenue)}</p>
                          <p className="text-xs text-zinc-500">{p.count} vendas</p>
                        </div>
                      </div>
                      <Bar value={p.revenue} max={maxProfileRevenue} color={theme?.accentHex ?? '#6b7280'} />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Por Gateway */}
            <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/70 p-5 space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                🏦 Receita por Gateway
              </h2>
              <div className="space-y-3">
                {(data.byGateway.length === 0
                  ? [{ gateway: 'INTER', revenue: 0, count: 0 }]
                  : data.byGateway
                ).sort((a, b) => b.revenue - a.revenue).map((g) => {
                  const pct = maxGatewayRevenue > 0
                    ? ((g.revenue / maxGatewayRevenue) * 100).toFixed(0)
                    : '0'
                  return (
                    <div key={g.gateway} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">
                          {GATEWAY_LABELS[g.gateway] ?? g.gateway}
                        </span>
                        <div className="text-right">
                          <p className="text-sm font-bold text-white">{BRL.format(g.revenue)}</p>
                          <p className="text-xs text-zinc-500">{g.count} txns</p>
                        </div>
                      </div>
                      <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Moedas */}
              <div className="pt-3 border-t border-zinc-800 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Divisão por Moeda</p>
                {data.byCurrency.map((c) => (
                  <div key={c.currency} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-400">
                      {c.currency === 'BRL' ? '🇧🇷 BRL' : c.currency === 'USD' ? '🇺🇸 USD' : c.currency}
                    </span>
                    <span className="font-semibold text-white">
                      {c.currency === 'BRL' ? BRL.format(c.amount) : USD.format(c.amount)}
                    </span>
                  </div>
                ))}
                {data.byCurrency.length === 0 && (
                  <p className="text-zinc-600 text-xs">Sem dados de moeda no período</p>
                )}
              </div>
            </div>

            {/* Por Tipo de Receita */}
            <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/70 p-5 space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                📊 Breakdown por Tipo de Receita
              </h2>
              {data.byType.length === 0 ? (
                <p className="text-zinc-600 text-sm">Sem transações registradas no período.</p>
              ) : (
                <div className="space-y-3">
                  {data.byType.sort((a, b) => b.revenue - a.revenue).map((t) => {
                    const total = data.byType.reduce((s, x) => s + x.revenue, 0)
                    const share = total > 0 ? (t.revenue / total) * 100 : 0
                    return (
                      <div key={t.type} className="flex items-center justify-between gap-4">
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-semibold text-white">
                            {TYPE_LABELS[t.type] ?? t.type}
                          </p>
                          <div className="h-1.5 w-full rounded-full bg-zinc-800">
                            <div
                              className="h-full rounded-full bg-violet-500"
                              style={{ width: `${share.toFixed(0)}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-white">{BRL.format(t.revenue)}</p>
                          <p className="text-xs text-zinc-500">{PCT(share)} do total</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Assinaturas Ativas */}
            <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/70 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                  🔄 Recorrência Ativa
                </h2>
                <a
                  href="/dashboard/admin/subscriptions"
                  className="text-xs text-violet-400 hover:text-violet-300 transition"
                >
                  Gerenciar →
                </a>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-zinc-800/60 p-4 text-center space-y-1">
                  <p className="text-2xl font-black text-amber-400">{BRL.format(data.mrr.total)}</p>
                  <p className="text-xs text-zinc-500 uppercase font-bold tracking-wide">MRR</p>
                </div>
                <div className="rounded-xl bg-zinc-800/60 p-4 text-center space-y-1">
                  <p className="text-2xl font-black text-emerald-400">{BRL.format(s?.arrBrl ?? 0)}</p>
                  <p className="text-xs text-zinc-500 uppercase font-bold tracking-wide">ARR</p>
                </div>
              </div>
              <div className="space-y-2">
                {data.mrr.byProfile.length === 0 ? (
                  <p className="text-zinc-600 text-sm text-center py-2">Nenhuma assinatura ativa ainda.</p>
                ) : (
                  data.mrr.byProfile.sort((a, b) => b.mrr - a.mrr).map((p) => {
                    const theme = PROFILE_THEMES[p.profileType as ClientProfileType]
                    const label = PROFILE_TYPE_LABELS[p.profileType as ClientProfileType] ?? p.profileType
                    return (
                      <div key={p.profileType} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span>{theme?.emoji ?? '📦'}</span>
                          <span className="text-zinc-300">{label}</span>
                          <span className="text-zinc-600 text-xs">({p.count})</span>
                        </div>
                        <span className="font-semibold text-white">{BRL.format(p.mrr)}/mês</span>
                      </div>
                    )
                  })
                )}
              </div>
              <div className="pt-3 border-t border-zinc-800 flex items-center justify-between text-sm">
                <span className="text-zinc-500">Total de assinaturas</span>
                <span className="font-bold text-white">{s?.activeSubscriptions ?? 0} ativas</span>
              </div>
            </div>
          </div>

          {/* ROI Real-Time Widget */}
          <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/70 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">📡 ROI Real-Time</p>
                <p className="text-sm text-zinc-400 mt-0.5">Lucro ÷ Spend de Anúncio = ROI efetivo</p>
              </div>
              <div className="flex gap-2">
                <a href="/dashboard/admin/ad-monitoring" className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition">
                  📊 Spend
                </a>
                <button
                  onClick={() => { if (!attrData) fetchAttribution(); else setShowAttr((v) => !v) }}
                  disabled={attrLoading}
                  className="rounded-lg bg-violet-600/20 border border-violet-500/30 px-3 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-600/30 transition disabled:opacity-50"
                >
                  {attrLoading ? '⏳ Carregando…' : '🔍 Atribuição 360'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: 'Lucro Líquido (período)',
                  value: BRL.format(s?.totalProfitBrl ?? 0),
                  accent: '#34d399',
                },
                {
                  label: 'Margem Média',
                  value: PCT(s?.marginPct ?? 0),
                  accent: '#60a5fa',
                },
                {
                  label: 'ROI (precisar cadastrar spend)',
                  value: '→ /ad-monitoring',
                  accent: '#a78bfa',
                },
              ].map((k) => (
                <div key={k.label} className="rounded-xl bg-zinc-800/40 p-3">
                  <p className="text-[10px] font-bold uppercase text-zinc-600">{k.label}</p>
                  <p className="text-base font-black mt-1" style={{ color: k.accent }}>{k.value}</p>
                </div>
              ))}
            </div>

            {/* Attribution 360 expandido */}
            {showAttr && attrData && (
              <div className="space-y-3 border-t border-zinc-800 pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-white">🔍 Atribuição 360 — Origem das Conversões</p>
                  <div className="flex gap-3 text-xs text-zinc-500">
                    <span>{attrData.totalTouchpoints} conversões</span>
                    <span>{BRL.format(attrData.totalRevenueBrl)} receita</span>
                    <span className="text-emerald-400">{BRL.format(attrData.totalNetProfitBrl)} lucro</span>
                  </div>
                </div>
                {attrData.channelBreakdown.length === 0 ? (
                  <p className="text-zinc-500 text-sm">Nenhuma conversão com UTM encontrada. Configure UTMs nos seus links de anúncio.</p>
                ) : (
                  <div className="space-y-2">
                    {attrData.channelBreakdown.slice(0, 10).map((ch) => {
                      const roiPct = ch.netProfitBrl && ch.revenueBrl > 0
                        ? (ch.netProfitBrl / ch.revenueBrl * 100)
                        : null
                      const share = attrData.totalRevenueBrl > 0
                        ? (ch.revenueBrl / attrData.totalRevenueBrl * 100)
                        : 0
                      return (
                        <div key={`${ch.source}|${ch.medium}`} className="rounded-xl bg-zinc-800/30 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-lg shrink-0">{getSourceEmoji(ch.source)}</span>
                              <div className="min-w-0">
                                <p className="font-semibold text-white text-sm">
                                  {ch.source}
                                  <span className="text-zinc-500 font-normal ml-1">/ {ch.medium}</span>
                                </p>
                                {ch.campaigns.length > 0 && (
                                  <p className="text-[10px] text-zinc-600 truncate">
                                    {ch.campaigns.slice(0, 2).join(' · ')}{ch.campaigns.length > 2 ? ` +${ch.campaigns.length - 2}` : ''}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0 space-y-0.5">
                              <p className="text-sm font-black text-white">{BRL.format(ch.revenueBrl)}</p>
                              {roiPct !== null && (
                                <p className="text-[10px] font-bold text-emerald-400">
                                  {PCT(roiPct)} margem
                                </p>
                              )}
                              <p className="text-[10px] text-zinc-600">{ch.touchpoints} conversões · {PCT(share)}</p>
                            </div>
                          </div>
                          {/* Barra de share */}
                          <div className="mt-2 h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
                            <div className="h-full rounded-full bg-violet-500" style={{ width: `${share}%` }} />
                          </div>
                        </div>
                      )
                    })}
                    {attrData.channelBreakdown.length > 10 && (
                      <p className="text-xs text-zinc-600 text-center">+{attrData.channelBreakdown.length - 10} canais adicionais via <a href="/dashboard/admin/attribution-360" className="text-violet-400 hover:underline">painel completo</a></p>
                    )}
                  </div>
                )}
                <div className="rounded-lg bg-blue-600/10 border border-blue-600/20 p-3">
                  <p className="text-xs text-blue-300">
                    <strong>Como funciona:</strong> Este relatório cruza os UTMs capturados no momento do checkout (utm_source, utm_medium, utm_campaign) com as conversões confirmadas pelo Banco Inter. Para ROI completo, cadastre o gasto de anúncio diário em <a href="/dashboard/admin/ad-monitoring" className="underline">Monitoramento de Spend</a>.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Rodapé estratégico */}
          <div className="rounded-2xl border border-violet-500/20 bg-violet-600/5 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-violet-400 mb-2">
              🧠 Insight Estratégico
            </p>
            <p className="text-zinc-300 text-sm leading-relaxed">
              {runRate >= TARGET_8D
                ? `🎉 Meta de 8 dígitos atingida! Run rate atual: ${BRL.format(runRate)}/ano. Foco agora em aumentar margem e expansão USD.`
                : runRate >= 5_000_000
                  ? `⚡ ${PCT(progress)} do caminho para os 8 dígitos. Diferença: ${BRL.format(TARGET_8D - runRate)}/ano. Acelere a recorrência — cada ${BRL.format(1000)} de MRR = ${BRL.format(12000)} de ARR.`
                  : `🚀 Para bater R$ 10M/ano, você precisa de mais ${BRL.format(TARGET_8D - runRate)}/ano. Com MRR atual de ${BRL.format(data.mrr.total)}, o ARR de recorrência já contribui com ${BRL.format(data.mrr.total * 12)} — ${PCT((data.mrr.total * 12 / TARGET_8D) * 100)} da meta.`}
            </p>
          </div>
        </>
      )}
    </div>
  )
}
