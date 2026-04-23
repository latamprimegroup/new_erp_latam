'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, Users, ShoppingBag, Target, RefreshCw,
  Loader2, ChevronDown, ChevronUp, AlertCircle, ExternalLink,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Funnel = {
  totalLeads: number; totalCheckouts: number; totalPaid: number
  pixConvRate: number; checkoutConvRate: number
}
type Kpis    = { totalRevenue: number; avgTicket: number }
type Campaign = {
  campaign: string; source: string; medium: string
  leads: number; checkouts: number; paid: number
  revenue: number; convRate: number; avgTicket: number
}
type Source   = { source: string; leads: number; paid: number; revenue: number }
type Abandoned = {
  checkoutId: string; leadName: string; whatsapp: string
  adsId: string | null; amount: number; createdAt: string
}
type RecentLead = {
  id: string; name: string; whatsapp: string; adsId: string | null
  campaign: string | null; source: string | null; paid: boolean; createdAt: string
}
type RoiData = {
  period:      { days: number; since: string }
  funnel:      Funnel
  kpis:        Kpis
  campaigns:   Campaign[]
  sources:     Source[]
  abandoned:   Abandoned[]
  recentLeads: RecentLead[]
}

// ─── Formatadores ─────────────────────────────────────────────────────────────

const brl  = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct  = (v: number) => `${v.toFixed(1)}%`
const dt   = (s: string) => new Date(s).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
const waLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g,'')}`

function KpiCard({ label, value, sub, color = 'text-zinc-900 dark:text-white' }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-5">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function FunnelBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-500">{label}</span>
        <span className="font-bold text-zinc-700 dark:text-zinc-300">{value}</span>
      </div>
      <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

const PERIODS = [7, 14, 30, 60, 90] as const

export function RoiTab() {
  const [data, setData]       = useState<RoiData | null>(null)
  const [days, setDays]       = useState<number>(30)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // Seções colapsáveis
  const [showCampaigns, setShowCampaigns]   = useState(true)
  const [showSources,   setShowSources]     = useState(true)
  const [showAbandoned, setShowAbandoned]   = useState(false)
  const [showLeads,     setShowLeads]       = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const r = await fetch(`/api/admin/roi?days=${days}`)
    if (r.ok) setData(await r.json() as RoiData)
    else setError('Erro ao carregar dados de ROI')
    setLoading(false)
  }, [days])

  useEffect(() => { load() }, [load])

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary-500" />
            BI & ROI — Rastreamento Utmify
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">Funil de conversão, campanhas e abandono de checkout</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1">
            {PERIODS.map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${days === d ? 'bg-white dark:bg-zinc-700 shadow text-primary-600' : 'text-zinc-500 hover:text-zinc-700'}`}>
                {d}d
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading}
            className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            {loading ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400" /> : <RefreshCw className="w-4 h-4 text-zinc-400" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/10 p-4 flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      {data && (
        <>
          {/* ── KPIs ──────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard label="Faturamento Aprovado" value={brl(data.kpis.totalRevenue)} sub={`${data.funnel.totalPaid} vendas`} color="text-emerald-600" />
            <KpiCard label="Ticket Médio"          value={brl(data.kpis.avgTicket)} />
            <KpiCard label="PIX Gerados"           value={String(data.funnel.totalCheckouts)} sub={`de ${data.funnel.totalLeads} leads`} />
            <KpiCard label="Taxa de Conversão"     value={pct(data.funnel.checkoutConvRate)} sub="PIX gerado → pago" color="text-primary-600" />
          </div>

          {/* ── Funil ─────────────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-5">
            <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
              <Target className="w-4 h-4 text-primary-500" />
              Funil de Conversão — últimos {days} dias
            </h3>
            <div className="space-y-3">
              <FunnelBar label="👥 Leads capturados" value={data.funnel.totalLeads}     total={data.funnel.totalLeads}     color="bg-blue-400" />
              <FunnelBar label="⚡ PIX gerados"       value={data.funnel.totalCheckouts} total={data.funnel.totalLeads}     color="bg-amber-400" />
              <FunnelBar label="✅ Vendas pagas"       value={data.funnel.totalPaid}      total={data.funnel.totalCheckouts} color="bg-emerald-500" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500">
              <span>Lead → PIX: <strong className="text-zinc-700 dark:text-zinc-300">{pct(data.funnel.pixConvRate)}</strong></span>
              <span>PIX → Pago: <strong className="text-zinc-700 dark:text-zinc-300">{pct(data.funnel.checkoutConvRate)}</strong></span>
            </div>
          </div>

          {/* ── Ranking de Campanhas ─────────────────────────────────────── */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-5">
            <button onClick={() => setShowCampaigns((v) => !v)}
              className="w-full flex items-center justify-between font-bold text-sm">
              <span className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary-500" />Ranking de Campanhas ({data.campaigns.length})</span>
              {showCampaigns ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
            </button>

            {showCampaigns && (
              <div className="mt-4 overflow-x-auto -mx-2">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-left text-zinc-500 font-semibold bg-zinc-50 dark:bg-zinc-800/50">
                      <th className="px-3 py-2">Campanha</th>
                      <th className="px-3 py-2">Fonte</th>
                      <th className="px-3 py-2 text-right">Leads</th>
                      <th className="px-3 py-2 text-right">PIX</th>
                      <th className="px-3 py-2 text-right">Pagos</th>
                      <th className="px-3 py-2 text-right">Conv.</th>
                      <th className="px-3 py-2 text-right">Ticket Médio</th>
                      <th className="px-3 py-2 text-right">Faturamento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {data.campaigns.map((c, i) => (
                      <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                        <td className="px-3 py-2 font-semibold max-w-[180px] truncate" title={c.campaign}>{c.campaign}</td>
                        <td className="px-3 py-2 text-zinc-500">{c.source}</td>
                        <td className="px-3 py-2 text-right">{c.leads}</td>
                        <td className="px-3 py-2 text-right">{c.checkouts}</td>
                        <td className="px-3 py-2 text-right">
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">{c.paid}</span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={c.convRate >= 50 ? 'text-emerald-600 font-bold' : c.convRate >= 20 ? 'text-amber-600' : 'text-red-500'}>
                            {pct(c.convRate)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-primary-600 font-semibold">{brl(c.avgTicket)}</td>
                        <td className="px-3 py-2 text-right font-bold text-emerald-600">{brl(c.revenue)}</td>
                      </tr>
                    ))}
                    {data.campaigns.length === 0 && (
                      <tr><td colSpan={8} className="px-3 py-6 text-center text-zinc-400">Nenhuma campanha registrada no período</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Ranking de Fontes ────────────────────────────────────────── */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-5">
            <button onClick={() => setShowSources((v) => !v)}
              className="w-full flex items-center justify-between font-bold text-sm">
              <span className="flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-primary-500" />Fontes de Tráfego ({data.sources.length})</span>
              {showSources ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
            </button>

            {showSources && (
              <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.sources.map((s, i) => {
                  const conv = s.leads > 0 ? (s.paid / s.leads) * 100 : 0
                  return (
                    <div key={i} className="rounded-xl border border-zinc-100 dark:border-zinc-800 p-4">
                      <p className="font-bold text-sm truncate">{s.source}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{s.leads} leads · {s.paid} pagos · {pct(conv)} conv.</p>
                      <p className="text-emerald-600 font-bold text-lg mt-1">{brl(s.revenue)}</p>
                    </div>
                  )
                })}
                {data.sources.length === 0 && <p className="text-zinc-400 text-xs col-span-3">Nenhuma fonte registrada</p>}
              </div>
            )}
          </div>

          {/* ── Abandono de Checkout ─────────────────────────────────────── */}
          {data.abandoned.length > 0 && (
            <div className="rounded-2xl border border-amber-200 dark:border-amber-800/40 bg-white dark:bg-ads-dark-card p-5">
              <button onClick={() => setShowAbandoned((v) => !v)}
                className="w-full flex items-center justify-between font-bold text-sm">
                <span className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  ⚠️ PIX Abandonados — Remarketing ({data.abandoned.length})
                </span>
                {showAbandoned ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
              </button>

              {showAbandoned && (
                <div className="mt-4 overflow-x-auto -mx-2">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-left text-zinc-500 font-semibold bg-zinc-50 dark:bg-zinc-800/50">
                        <th className="px-3 py-2">Lead</th>
                        <th className="px-3 py-2">WhatsApp</th>
                        <th className="px-3 py-2">Ativo</th>
                        <th className="px-3 py-2 text-right">Valor</th>
                        <th className="px-3 py-2">Hora</th>
                        <th className="px-3 py-2">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {data.abandoned.map((a, i) => (
                        <tr key={i} className="hover:bg-amber-50/50 dark:hover:bg-amber-950/10">
                          <td className="px-3 py-2 font-semibold">{a.leadName}</td>
                          <td className="px-3 py-2 text-zinc-500 font-mono">{a.whatsapp}</td>
                          <td className="px-3 py-2 text-primary-600 font-mono">{a.adsId ?? '—'}</td>
                          <td className="px-3 py-2 text-right font-bold text-amber-700">{brl(a.amount)}</td>
                          <td className="px-3 py-2 text-zinc-400">{dt(a.createdAt)}</td>
                          <td className="px-3 py-2">
                            <a href={waLink(a.whatsapp)} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1 text-emerald-600 hover:underline font-semibold">
                              WA <ExternalLink className="w-3 h-3" />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Leads Recentes (24h) ─────────────────────────────────────── */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-5">
            <button onClick={() => setShowLeads((v) => !v)}
              className="w-full flex items-center justify-between font-bold text-sm">
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary-500" />
                Leads Últimas 24h ({data.recentLeads.length})
              </span>
              {showLeads ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
            </button>

            {showLeads && (
              <div className="mt-4 overflow-x-auto -mx-2">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-left text-zinc-500 font-semibold bg-zinc-50 dark:bg-zinc-800/50">
                      <th className="px-3 py-2">Nome</th>
                      <th className="px-3 py-2">WhatsApp</th>
                      <th className="px-3 py-2">Ativo</th>
                      <th className="px-3 py-2">Campanha</th>
                      <th className="px-3 py-2">Fonte</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Hora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {data.recentLeads.map((l) => (
                      <tr key={l.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                        <td className="px-3 py-2 font-semibold">{l.name}</td>
                        <td className="px-3 py-2">
                          <a href={waLink(l.whatsapp)} target="_blank" rel="noreferrer"
                            className="text-emerald-600 hover:underline flex items-center gap-1">
                            {l.whatsapp} <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                        <td className="px-3 py-2 text-primary-600 font-mono">{l.adsId ?? '—'}</td>
                        <td className="px-3 py-2 text-zinc-500 max-w-[120px] truncate" title={l.campaign ?? ''}>{l.campaign ?? '—'}</td>
                        <td className="px-3 py-2 text-zinc-500">{l.source ?? '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${l.paid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {l.paid ? '✅ Pago' : '⏳ PIX'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-zinc-400">{dt(l.createdAt)}</td>
                      </tr>
                    ))}
                    {data.recentLeads.length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-6 text-center text-zinc-400">Nenhum lead nas últimas 24h</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {!data && !loading && !error && (
        <p className="text-center text-zinc-400 py-12">Nenhum dado encontrado para o período selecionado.</p>
      )}
    </div>
  )
}
