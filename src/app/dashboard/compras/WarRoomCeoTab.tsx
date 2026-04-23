'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  RefreshCw, Loader2, AlertTriangle, TrendingUp, DollarSign,
  ShoppingBag, BarChart2, Search, Star, User, Award, Zap,
  CheckCircle2, XCircle, Clock, Filter, ChevronDown, ChevronUp,
  ArrowUpRight, Package,
} from 'lucide-react'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Kpis = {
  month:  { revenue: number; cost: number; profit: number; margin: number; count: number }
  year:   { revenue: number; profit: number; count: number }
  all:    { revenue: number; profit: number; count: number }
  stock:  { value: number; cost: number; margin: number; count: number }
}

type VendorRank = {
  id: string; name: string; category: string
  totalAssets: number; soldCount: number
  revenue: number; cost: number
  rmaCount: number; vendorFaultRma: number; faultRate: number
  rmaLoss: number; realProfit: number
  avgSurvivalHours: number | null
  healthScore: number; rating: number
}

type Buyer = {
  id: string; code: string | null; name: string; email: string
  totalSpent: number; totalAccounts: number; refundCount: number
  reputation: number | null; lastPurchase: string | null
  avgTicket: number; tier: 'PARTNER' | 'VIP' | 'VAREJO'
}

type Sale = {
  id: string; adsId: string; category: string; displayName: string
  salePrice: number; costPrice: number; profit: number
  soldAt: string | null; vendor: string; buyer: string
}

type AssetRow = {
  id: string; adsId: string; category: string; subCategory: string | null
  status: string; displayName: string
  salePrice: number; costPrice: number; profit: number; margin: number
  tags: string | null; specs: Record<string, unknown> | null
  createdAt: string; soldAt: string | null
  vendor: string; vendorId: string; rmaCount: number
}

type LowStock = { category: string; count: number }

type WarRoomData = {
  kpis: Kpis
  vendorRanking: VendorRank[]
  lowStockAlerts: LowStock[]
  topBuyers: Buyer[]
  recentSales: Sale[]
  assets: AssetRow[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const brl   = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct   = (v: number) => `${v.toFixed(0)}%`
const short = (v: number) =>
  v >= 1_000_000 ? `R$${(v / 1_000_000).toFixed(1)}M`
  : v >= 1_000   ? `R$${(v / 1_000).toFixed(1)}k`
  : brl(v)

const TIER_COLORS: Record<string, string> = {
  PARTNER: 'bg-violet-100 text-violet-700',
  VIP:     'bg-amber-100 text-amber-700',
  VAREJO:  'bg-zinc-100 text-zinc-600',
}

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'Disponível', QUARANTINE: 'Quarentena', SOLD: 'Vendido',
  DEAD: 'Baixado', DELIVERED: 'Entregue', TRIAGEM: 'Em Triagem',
  AWAITING_VENDOR: 'Aguard. Fornec.', RECEIVED: 'Recebido',
}
const STATUS_COLOR: Record<string, string> = {
  AVAILABLE: 'text-green-600', SOLD: 'text-blue-600', DEAD: 'text-red-500',
  QUARANTINE: 'text-amber-600', DELIVERED: 'text-zinc-400',
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export function WarRoomCeoTab() {
  const [data, setData]       = useState<WarRoomData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  // Seções colapsáveis
  const [showVendors, setShowVendors]   = useState(true)
  const [showBuyers, setShowBuyers]     = useState(true)
  const [showFeed, setShowFeed]         = useState(true)
  const [showTable, setShowTable]       = useState(true)

  // Filtros tabela CEO
  const [filterStatus, setFilterStatus] = useState('')
  const [filterVendor, setFilterVendor] = useState('')
  const [filterDoc, setFilterDoc]       = useState(false)
  const [filterSafra, setFilterSafra]   = useState('')
  const [tableQ, setTableQ]             = useState('')

  // Busca Reversa
  const [reverseId, setReverseId]       = useState('')
  const [reverseResult, setReverseResult] = useState<AssetRow | null>(null)
  const [reverseNotFound, setReverseNotFound] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const r = await fetch('/api/compras/war-room')
    if (r.ok) setData(await r.json())
    else setError('Erro ao carregar dados do War Room.')
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Busca Reversa (client-side no array já carregado)
  const handleReverseSearch = () => {
    if (!data || !reverseId.trim()) return
    const q   = reverseId.trim().toUpperCase()
    const hit  = data.assets.find((a) => a.adsId.toUpperCase() === q)
    setReverseResult(hit ?? null)
    setReverseNotFound(!hit)
  }

  // Filtros tabela
  const filteredAssets = useMemo(() => {
    if (!data) return []
    return data.assets.filter((a) => {
      if (filterStatus && a.status !== filterStatus) return false
      if (filterVendor && a.vendorId !== filterVendor) return false
      if (filterDoc    && !a.tags?.includes('cnh-validada')) return false
      if (filterSafra  && String((a.specs as Record<string,unknown>)?.year ?? '') !== filterSafra) return false
      if (tableQ) {
        const q = tableQ.toLowerCase()
        if (!a.adsId.toLowerCase().includes(q) && !a.displayName.toLowerCase().includes(q) && !a.tags?.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [data, filterStatus, filterVendor, filterDoc, filterSafra, tableQ])

  // Safras únicas para o filtro
  const safras = useMemo(() => {
    if (!data) return []
    const set = new Set<string>()
    data.assets.forEach((a) => {
      const y = (a.specs as Record<string,unknown>)?.year
      if (y) set.add(String(y))
    })
    return [...set].sort().reverse()
  }, [data])

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
      <span className="ml-3 text-sm text-zinc-500">Carregando War Room OS...</span>
    </div>
  )

  if (error || !data) return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 flex items-center gap-3 text-red-700">
      <AlertTriangle className="w-5 h-5 shrink-0" />
      <p>{error || 'Sem dados'}</p>
    </div>
  )

  const { kpis, vendorRanking, lowStockAlerts, topBuyers, recentSales } = data
  const vendors = [...new Map(data.assets.map((a) => [a.vendorId, { id: a.vendorId, name: a.vendor }])).values()]

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            🛰️ War Room OS — Visão CEO
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Rastreabilidade total · Estoque · Fornecedores · Clientes · Margem
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
          <RefreshCw className="w-4 h-4" />Atualizar
        </button>
      </div>

      {/* ── Alertas estoque baixo ────────────────────────────────────────── */}
      {lowStockAlerts.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-red-700 font-bold text-sm shrink-0">
            <AlertTriangle className="w-4 h-4" />Estoque Crítico
          </div>
          {lowStockAlerts.map((a) => (
            <span key={a.category}
              className="px-3 py-1 rounded-full bg-red-100 border border-red-300 text-red-700 text-xs font-bold">
              {a.category}: {a.count} un.
            </span>
          ))}
          <span className="text-xs text-red-500 ml-auto">Reposição urgente — menos de {5} unidades disponíveis</span>
        </div>
      )}

      {/* ── KPIs Executivos ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Faturamento Mês', value: short(kpis.month.revenue),
            sub: `${kpis.month.count} vendas · ${pct(kpis.month.margin)} margem`,
            icon: <DollarSign className="w-5 h-5" />, color: 'border-l-blue-500 text-blue-600',
          },
          {
            label: 'Lucro Líquido Mês', value: short(kpis.month.profit),
            sub: `Capital: ${short(kpis.month.cost)}`,
            icon: <TrendingUp className="w-5 h-5" />, color: 'border-l-emerald-500 text-emerald-600',
          },
          {
            label: 'Acumulado Ano', value: short(kpis.year.revenue),
            sub: `Lucro: ${short(kpis.year.profit)} · ${kpis.year.count} vendas`,
            icon: <BarChart2 className="w-5 h-5" />, color: 'border-l-violet-500 text-violet-600',
          },
          {
            label: 'Estoque Disponível', value: short(kpis.stock.value),
            sub: `${kpis.stock.count} ativos · Margem: ${short(kpis.stock.margin)}`,
            icon: <Package className="w-5 h-5" />, color: 'border-l-amber-500 text-amber-600',
          },
        ].map((k) => (
          <div key={k.label}
            className={`bg-white dark:bg-ads-dark-card rounded-xl border border-zinc-100 dark:border-zinc-800 border-l-4 ${k.color.split(' ')[0]} p-4`}>
            <div className={`flex items-center gap-1.5 mb-2 ${k.color.split(' ')[1]}`}>
              {k.icon}
              <span className="text-[10px] font-bold uppercase tracking-wide">{k.label}</span>
            </div>
            <p className={`text-xl font-bold leading-tight ${k.color.split(' ')[1]}`}>{k.value}</p>
            <p className="text-[10px] text-zinc-400 mt-1">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Meta 1M ─────────────────────────────────────────────────────── */}
      {(() => {
        const META = 1_000_000
        const pctMeta = Math.min(100, Math.round((kpis.month.revenue / META) * 100))
        return (
          <div className="rounded-xl border border-primary-200 bg-primary-50 dark:bg-primary-950/10 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-primary-700">Meta R$ 1M/mês</span>
              <span className="text-sm font-bold text-primary-700">{pct(pctMeta)} atingido</span>
            </div>
            <div className="h-3 rounded-full bg-primary-100 dark:bg-primary-900/30 overflow-hidden">
              <div className="h-full rounded-full bg-primary-500 transition-all"
                style={{ width: `${pctMeta}%` }} />
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Faltam {short(Math.max(0, META - kpis.month.revenue))} para fechar o mês em R$ 1M
            </p>
          </div>
        )
      })()}

      {/* ── Busca Reversa ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-3">
        <p className="text-sm font-bold flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />Busca Reversa por ID Público
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input
              value={reverseId}
              onChange={(e) => { setReverseId(e.target.value); setReverseResult(null); setReverseNotFound(false) }}
              onKeyDown={(e) => e.key === 'Enter' && handleReverseSearch()}
              placeholder="AA-CONT-000001"
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>
          <button onClick={handleReverseSearch}
            className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-bold hover:bg-primary-700 transition-colors">
            Buscar
          </button>
        </div>
        {reverseNotFound && (
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <XCircle className="w-4 h-4" />ID não encontrado no estoque.
          </div>
        )}
        {reverseResult && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="font-mono font-bold text-emerald-700">{reverseResult.adsId}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[reverseResult.status] ?? 'text-zinc-500'}`}>
                {STATUS_LABEL[reverseResult.status] ?? reverseResult.status}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><p className="text-zinc-400">Nome comercial</p><p className="font-semibold">{reverseResult.displayName}</p></div>
              <div><p className="text-zinc-400">Fornecedor</p><p className="font-semibold text-amber-700">{reverseResult.vendor}</p></div>
              <div><p className="text-zinc-400">Custo</p><p className="font-semibold text-red-600">{brl(reverseResult.costPrice)}</p></div>
              <div><p className="text-zinc-400">Preço venda</p><p className="font-semibold text-blue-600">{brl(reverseResult.salePrice)}</p></div>
              <div><p className="text-zinc-400">Lucro</p><p className="font-semibold text-emerald-600">{brl(reverseResult.profit)} ({pct(reverseResult.margin)})</p></div>
              <div><p className="text-zinc-400">Tags / DOC</p><p className="font-mono text-[11px]">{reverseResult.tags ?? '—'}</p></div>
              {reverseResult.soldAt && <div><p className="text-zinc-400">Vendido em</p><p className="font-semibold">{new Date(reverseResult.soldAt).toLocaleString('pt-BR')}</p></div>}
              {reverseResult.rmaCount > 0 && (
                <div><p className="text-zinc-400">RMAs</p><p className="font-bold text-red-600">{reverseResult.rmaCount} ticket(s)</p></div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Ranking de Fornecedores ───────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <button onClick={() => setShowVendors((v) => !v)}
          className="w-full flex items-center justify-between p-4 text-left bg-zinc-50 dark:bg-zinc-800/50">
          <span className="font-bold text-sm flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" />
            Ranking de Fornecedores — Health Score & LTV Real
          </span>
          {showVendors ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </button>
        {showVendors && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800">
                <tr className="text-left text-zinc-500 font-semibold">
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Fornecedor</th>
                  <th className="px-4 py-2 text-right">Ativos</th>
                  <th className="px-4 py-2 text-right">Vendidos</th>
                  <th className="px-4 py-2 text-right">Receita</th>
                  <th className="px-4 py-2 text-right">Custo</th>
                  <th className="px-4 py-2 text-right">RMAs</th>
                  <th className="px-4 py-2 text-right">Perda RMA</th>
                  <th className="px-4 py-2 text-right">Lucro Real</th>
                  <th className="px-4 py-2 text-center">Health</th>
                  <th className="px-4 py-2 text-center">Taxa Falha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {vendorRanking.map((v, i) => {
                  const health = v.healthScore
                  const healthColor = health >= 80 ? 'text-emerald-600' : health >= 60 ? 'text-amber-600' : 'text-red-600'
                  const healthBg    = health >= 80 ? 'bg-emerald-100' : health >= 60 ? 'bg-amber-100' : 'bg-red-100'
                  return (
                    <tr key={v.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3 font-bold text-zinc-400">#{i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-zinc-900 dark:text-zinc-100">{v.name}</p>
                        <p className="text-zinc-400">{v.category}</p>
                      </td>
                      <td className="px-4 py-3 text-right">{v.totalAssets}</td>
                      <td className="px-4 py-3 text-right text-blue-600 font-semibold">{v.soldCount}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 font-semibold">{brl(v.revenue)}</td>
                      <td className="px-4 py-3 text-right text-red-500">{brl(v.cost)}</td>
                      <td className="px-4 py-3 text-right">{v.rmaCount}</td>
                      <td className="px-4 py-3 text-right text-red-600">{v.rmaLoss > 0 ? brl(v.rmaLoss) : '—'}</td>
                      <td className={`px-4 py-3 text-right font-bold ${v.realProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {brl(v.realProfit)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${healthBg} ${healthColor}`}>
                          {health}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold ${v.faultRate >= 20 ? 'text-red-600' : v.faultRate >= 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {pct(v.faultRate)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Top Compradores / LTV ────────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <button onClick={() => setShowBuyers((v) => !v)}
          className="w-full flex items-center justify-between p-4 text-left bg-zinc-50 dark:bg-zinc-800/50">
          <span className="font-bold text-sm flex items-center gap-2">
            <User className="w-4 h-4 text-violet-500" />
            Carteira de Clientes — LTV & Tier
          </span>
          {showBuyers ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </button>
        {showBuyers && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800">
                <tr className="text-left text-zinc-500 font-semibold">
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">Tier</th>
                  <th className="px-4 py-2 text-right">Total Gasto</th>
                  <th className="px-4 py-2 text-right">Contas</th>
                  <th className="px-4 py-2 text-right">Ticket Médio</th>
                  <th className="px-4 py-2 text-right">RMAs</th>
                  <th className="px-4 py-2 text-center">Reputação</th>
                  <th className="px-4 py-2">Última compra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {topBuyers.map((b) => (
                  <tr key={b.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{b.name}</p>
                      <p className="text-zinc-400 font-mono">{b.code ?? b.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${TIER_COLORS[b.tier]}`}>
                        {b.tier === 'PARTNER' ? '🐋 PARTNER' : b.tier === 'VIP' ? '⭐ VIP' : 'VAREJO'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600">{brl(b.totalSpent)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{b.totalAccounts}</td>
                    <td className="px-4 py-3 text-right">{brl(b.avgTicket)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={b.refundCount > 0 ? 'text-red-600 font-bold' : 'text-zinc-400'}>{b.refundCount}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {b.reputation != null
                        ? <span className={`font-bold ${b.reputation >= 80 ? 'text-emerald-600' : b.reputation >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{b.reputation}</span>
                        : <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {b.lastPurchase ? new Date(b.lastPurchase).toLocaleDateString('pt-BR') : '—'}
                    </td>
                  </tr>
                ))}
                {topBuyers.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-zinc-400">Nenhum comprador com dados de LTV</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Feed de Vendas Recentes ───────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <button onClick={() => setShowFeed((v) => !v)}
          className="w-full flex items-center justify-between p-4 text-left bg-zinc-50 dark:bg-zinc-800/50">
          <span className="font-bold text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" />
            Feed de Vendas Recentes
          </span>
          {showFeed ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </button>
        {showFeed && (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {recentSales.map((s) => (
              <div key={s.id} className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary-600">{s.adsId}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">{s.category}</span>
                  </div>
                  <p className="text-sm truncate">{s.displayName}</p>
                  <p className="text-[10px] text-zinc-400">{s.vendor} · Comprador: {s.buyer}</p>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <p className="text-sm font-bold text-blue-600">{brl(s.salePrice)}</p>
                  <p className="text-[10px] text-emerald-600 font-semibold">+{brl(s.profit)}</p>
                  <p className="text-[10px] text-zinc-400">{s.soldAt ? new Date(s.soldAt).toLocaleDateString('pt-BR') : '—'}</p>
                </div>
              </div>
            ))}
            {recentSales.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-zinc-400">Nenhuma venda registrada</p>
            )}
          </div>
        )}
      </div>

      {/* ── Tabela CEO Completa ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <button onClick={() => setShowTable((v) => !v)}
          className="w-full flex items-center justify-between p-4 text-left bg-zinc-50 dark:bg-zinc-800/50">
          <span className="font-bold text-sm flex items-center gap-2">
            <Star className="w-4 h-4 text-primary-500" />
            Estoque Completo — Visão CEO ({filteredAssets.length} ativos)
          </span>
          {showTable ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </button>

        {showTable && (
          <>
            {/* Filtros */}
            <div className="flex flex-wrap gap-2 p-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/20">
              <Filter className="w-3.5 h-3.5 text-zinc-400 self-center" />
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
                <input value={tableQ} onChange={(e) => setTableQ(e.target.value)}
                  placeholder="ID ou nome..."
                  className="pl-7 pr-3 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs bg-white dark:bg-zinc-900 focus:outline-none w-40" />
              </div>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs bg-white dark:bg-zinc-900 focus:outline-none">
                <option value="">Todos status</option>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={filterVendor} onChange={(e) => setFilterVendor(e.target.value)}
                className="px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs bg-white dark:bg-zinc-900 focus:outline-none">
                <option value="">Todos fornecedores</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              {safras.length > 0 && (
                <select value={filterSafra} onChange={(e) => setFilterSafra(e.target.value)}
                  className="px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs bg-white dark:bg-zinc-900 focus:outline-none">
                  <option value="">🍷 Safra</option>
                  {safras.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
              <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                <input type="checkbox" checked={filterDoc} onChange={(e) => setFilterDoc(e.target.checked)}
                  className="w-3.5 h-3.5 accent-primary-600" />
                Com DOC/CNH
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800">
                  <tr className="text-left text-zinc-500 font-semibold">
                    <th className="px-4 py-2">ID Público</th>
                    <th className="px-4 py-2">Nome Comercial</th>
                    <th className="px-4 py-2">Fornecedor</th>
                    <th className="px-4 py-2 text-right">Custo</th>
                    <th className="px-4 py-2 text-right">Preço Venda</th>
                    <th className="px-4 py-2 text-right">Lucro R$</th>
                    <th className="px-4 py-2 text-right">Margem</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Safra</th>
                    <th className="px-4 py-2">DOC</th>
                    <th className="px-4 py-2 text-right">RMAs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredAssets.slice(0, 100).map((a) => {
                    const safra = (a.specs as Record<string,unknown>)?.year
                    const hasDoc = a.tags?.includes('cnh-validada')
                    return (
                      <tr key={a.id} className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors ${a.rmaCount > 0 ? 'bg-red-50/30' : ''}`}>
                        <td className="px-4 py-2.5 font-mono font-bold text-primary-600">{a.adsId}</td>
                        <td className="px-4 py-2.5 max-w-[180px] truncate">{a.displayName}</td>
                        <td className="px-4 py-2.5 text-amber-700 font-medium">{a.vendor}</td>
                        <td className="px-4 py-2.5 text-right text-red-500">{brl(a.costPrice)}</td>
                        <td className="px-4 py-2.5 text-right font-bold">{brl(a.salePrice)}</td>
                        <td className="px-4 py-2.5 text-right text-emerald-600 font-bold">{brl(a.profit)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`font-bold ${a.margin >= 50 ? 'text-emerald-600' : a.margin >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                            {pct(a.margin)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`font-semibold ${STATUS_COLOR[a.status] ?? 'text-zinc-500'}`}>
                            {STATUS_LABEL[a.status] ?? a.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-zinc-400">
                          {safra ? <span className="font-semibold text-amber-700">🍷 {String(safra)}</span> : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          {hasDoc ? <span className="text-emerald-600 font-bold">✅ CNH</span> : <span className="text-zinc-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {a.rmaCount > 0
                            ? <span className="text-red-600 font-bold flex items-center justify-end gap-1"><AlertTriangle className="w-3 h-3" />{a.rmaCount}</span>
                            : <span className="text-zinc-300">0</span>}
                        </td>
                      </tr>
                    )
                  })}
                  {filteredAssets.length === 0 && (
                    <tr><td colSpan={11} className="px-4 py-8 text-center text-zinc-400">Nenhum ativo encontrado</td></tr>
                  )}
                </tbody>
              </table>
              {filteredAssets.length > 100 && (
                <p className="text-center text-xs text-zinc-400 py-3">
                  Mostrando 100 de {filteredAssets.length} — use os filtros para refinar
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Legenda de Tiers ─────────────────────────────────────────────── */}
      <div className="grid sm:grid-cols-3 gap-3 text-xs">
        {[
          { tier: 'VAREJO',  emoji: '🛒', range: '1–5 contas',   desc: 'Preço tabela', color: TIER_COLORS.VAREJO },
          { tier: 'VIP',     emoji: '⭐', range: '6–20 contas',  desc: 'Desconto VIP disponível', color: TIER_COLORS.VIP },
          { tier: 'PARTNER', emoji: '🐋', range: '20+ contas',   desc: 'Preço atacado + API acesso', color: TIER_COLORS.PARTNER },
        ].map((t) => (
          <div key={t.tier} className={`rounded-xl border p-3 flex items-center gap-3 ${t.color}`}>
            <span className="text-2xl">{t.emoji}</span>
            <div>
              <p className="font-bold">{t.tier} — {t.range}</p>
              <p className="opacity-70">{t.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-zinc-400 text-center">
        War Room OS · Dados atualizados em {new Date(data.generatedAt ?? Date.now()).toLocaleString('pt-BR')} · Visão restrita a ADMIN
      </p>
    </div>
  )
}
