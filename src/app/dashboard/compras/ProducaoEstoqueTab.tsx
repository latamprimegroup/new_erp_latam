'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  RefreshCw, Loader2, CheckCircle, Package, DollarSign, TrendingUp, Flame,
  ChevronDown, ChevronUp, AlertTriangle, Clock, Rocket,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Asset = {
  id: string
  adsId: string
  category: string
  subCategory: string | null
  status: string
  costPrice: number
  salePrice: number
  displayName: string
  tags: string | null
  createdAt: string
  receivedAt: string | null
  specs?: Record<string, unknown> | null
  vendor?: { id: string; name: string; category: string; rating: number } | null
}

type KPIs = {
  triagemCount: number
  receivedCount: number
  availableCount: number
  patrimonioCusto: number
  potencialFaturamento: number
  margemPotencial: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: 'Recebido', TRIAGEM: 'Em Aquecimento', AVAILABLE: 'Disponível',
  QUARANTINE: 'Quarentena', SOLD: 'Vendido', DELIVERED: 'Entregue', DEAD: 'Baixado',
}
const STATUS_COLOR: Record<string, string> = {
  RECEIVED:  'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  TRIAGEM:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  AVAILABLE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  QUARANTINE:'bg-orange-100 text-orange-700',
  SOLD:      'bg-blue-100 text-blue-700',
  DEAD:      'bg-red-100 text-red-600',
}

// ─── Card de KPI ──────────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, sub, color,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className={`rounded-2xl border p-4 flex items-center gap-3 bg-white dark:bg-ads-dark-card ${color}`}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-white/60 dark:bg-black/20">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-current opacity-70">{label}</p>
        <p className="text-xl font-black leading-tight">{value}</p>
        {sub && <p className="text-[11px] opacity-60 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ProducaoEstoqueTab() {
  const [assets, setAssets]     = useState<Asset[]>([])
  const [kpis, setKpis]         = useState<KPIs | null>(null)
  const [loading, setLoading]   = useState(true)
  const [filterSt, setFilterSt] = useState<'TRIAGEM' | 'RECEIVED' | ''>('TRIAGEM')
  const [releasing, setReleasing] = useState<string | null>(null)
  const [flash, setFlash]       = useState<{ msg: string; ok: boolean } | null>(null)
  const [sortField, setSortField] = useState<'createdAt' | 'costPrice'>('createdAt')
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('desc')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '200' })
    if (filterSt) params.set('status', filterSt)

    const [assetsRes, kpiRes] = await Promise.all([
      fetch(`/api/compras/ativos?${params}`),
      fetch('/api/compras/ativos/producao-kpi'),
    ])

    if (assetsRes.ok) {
      const d = await assetsRes.json()
      setAssets(Array.isArray(d.assets) ? d.assets : [])
    }
    if (kpiRes.ok) {
      const k = await kpiRes.json()
      setKpis(k)
    }
    setLoading(false)
  }, [filterSt])

  useEffect(() => { load() }, [load])

  // Flash auto-dismiss
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 3500)
    return () => clearTimeout(t)
  }, [flash])

  // Liberar ativo para venda (TRIAGEM → AVAILABLE)
  async function liberar(asset: Asset) {
    setReleasing(asset.id)
    const res = await fetch(`/api/compras/ativos/${asset.id}/status`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'AVAILABLE', reason: 'Liberado para venda pelo Gerente de Produção' }),
    })
    if (res.ok) {
      setFlash({ msg: `✅ ${asset.adsId} liberado para venda!`, ok: true })
      load()
    } else {
      const d = await res.json()
      setFlash({ msg: `⚠️ ${d.error ?? 'Erro ao liberar'}`, ok: false })
    }
    setReleasing(null)
  }

  // Ordenação local
  const sorted = [...assets].sort((a, b) => {
    const va = sortField === 'costPrice' ? a.costPrice : new Date(a.createdAt).getTime()
    const vb = sortField === 'costPrice' ? b.costPrice : new Date(b.createdAt).getTime()
    return sortDir === 'asc' ? va - vb : vb - va
  })

  function toggleSort(field: 'createdAt' | 'costPrice') {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const SortIcon = ({ field }: { field: 'createdAt' | 'costPrice' }) => {
    if (sortField !== field) return null
    return sortDir === 'desc' ? <ChevronDown className="w-3 h-3 inline ml-0.5" /> : <ChevronUp className="w-3 h-3 inline ml-0.5" />
  }

  return (
    <div className="space-y-5">

      {/* Flash */}
      {flash && (
        <div className={`text-sm font-semibold px-4 py-2.5 rounded-xl border ${flash.ok ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-red-50 text-red-700 border-red-200'}`}>
          {flash.msg}
        </div>
      )}

      {/* KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            icon={<Flame className="w-5 h-5 text-amber-600" />}
            label="Em Aquecimento"
            value={String(kpis.triagemCount)}
            sub="ativos em TRIAGEM"
            color="border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300"
          />
          <KpiCard
            icon={<Package className="w-5 h-5 text-teal-600" />}
            label="Recebidos"
            value={String(kpis.receivedCount)}
            sub="aguardando triagem"
            color="border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300"
          />
          <KpiCard
            icon={<DollarSign className="w-5 h-5 text-rose-600" />}
            label="Patrimônio em Custo"
            value={brl(kpis.patrimonioCusto)}
            sub="investido em estoque"
            color="border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300"
          />
          <KpiCard
            icon={<TrendingUp className="w-5 h-5 text-green-600" />}
            label="Potencial de Faturamento"
            value={brl(kpis.potencialFaturamento)}
            sub={`margem ${kpis.margemPotencial.toFixed(1)}%`}
            color="border-green-200 dark:border-green-800 text-green-800 dark:text-green-300"
          />
        </div>
      )}

      {/* Filtros + ação */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-white dark:bg-ads-dark-card">
          {(['TRIAGEM', 'RECEIVED', ''] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterSt(st)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${filterSt === st ? 'bg-primary-600 text-white' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
            >
              {st === '' ? 'Todos' : STATUS_LABEL[st]}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card text-zinc-500 hover:text-primary-600 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <span className="ml-auto text-xs text-zinc-400">{assets.length} ativos</span>
      </div>

      {/* Tabela */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-12 text-center text-zinc-400 text-sm">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
            Nenhum ativo neste status.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">ID Público</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Fornecedor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-800" onClick={() => toggleSort('costPrice')}>
                    Custo <SortIcon field="costPrice" />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Preço Venda</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-800" onClick={() => toggleSort('createdAt')}>
                    Entrada <SortIcon field="createdAt" />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {sorted.map((a) => {
                  const margin = a.costPrice > 0
                    ? (((a.salePrice - a.costPrice) / a.costPrice) * 100)
                    : 0
                  const specs = a.specs as Record<string, unknown> | null | undefined
                  const entryDate = new Date(a.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                  const hoursIn = Math.round((Date.now() - new Date(a.createdAt).getTime()) / 3_600_000)

                  return (
                    <tr key={a.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      {/* ID Público */}
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-mono font-bold text-primary-600 dark:text-primary-400 text-sm">{a.adsId}</span>
                          <p className="text-[11px] text-zinc-400 mt-0.5 truncate max-w-[160px]">{a.displayName}</p>
                        </div>
                      </td>

                      {/* Fornecedor */}
                      <td className="px-4 py-3">
                        {a.vendor ? (
                          <div>
                            <p className="font-medium text-zinc-800 dark:text-zinc-200 text-sm">{a.vendor.name}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <div className="flex">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <span key={i} className={`text-[10px] ${i < a.vendor!.rating ? 'text-amber-400' : 'text-zinc-200 dark:text-zinc-700'}`}>★</span>
                                ))}
                              </div>
                              <span className="text-[10px] text-zinc-400">{a.vendor.category}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-zinc-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Custo */}
                      <td className="px-4 py-3">
                        <p className="font-bold text-rose-600 dark:text-rose-400">{brl(a.costPrice)}</p>
                      </td>

                      {/* Preço Venda */}
                      <td className="px-4 py-3">
                        <p className="font-bold text-green-600 dark:text-green-400">{brl(a.salePrice)}</p>
                        <p className="text-[11px] text-zinc-400">{margin.toFixed(0)}% margem</p>
                      </td>

                      {/* Entrada */}
                      <td className="px-4 py-3">
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">{entryDate}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-zinc-400" />
                          <span className="text-[11px] text-zinc-400">
                            {hoursIn < 24 ? `${hoursIn}h` : `${Math.round(hoursIn / 24)}d`} em estoque
                          </span>
                        </div>
                        {!!specs?.year && (
                          <p className="text-[11px] text-zinc-400">Conta {String(specs.year)}</p>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[a.status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                          {STATUS_LABEL[a.status] ?? a.status}
                        </span>
                      </td>

                      {/* Ação */}
                      <td className="px-4 py-3 text-right">
                        {a.status === 'TRIAGEM' ? (
                          <button
                            onClick={() => liberar(a)}
                            disabled={releasing === a.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {releasing === a.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Rocket className="w-3.5 h-3.5" />
                            )}
                            {releasing === a.id ? 'Liberando...' : 'Liberar para Venda'}
                          </button>
                        ) : a.status === 'RECEIVED' ? (
                          <span className="text-[11px] text-zinc-400 italic">Aguardando triagem</span>
                        ) : a.status === 'AVAILABLE' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-green-600 font-semibold">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Disponível
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-400">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Aviso de integridade */}
      <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl px-4 py-3 border border-zinc-100 dark:border-zinc-700">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
        <p>
          <strong>Segregação:</strong> Dados de fornecedor visíveis apenas para Gerentes de Produção, Compras e Admin.
          O comercial vê somente o ID Público e o preço de venda.
        </p>
      </div>
    </div>
  )
}
