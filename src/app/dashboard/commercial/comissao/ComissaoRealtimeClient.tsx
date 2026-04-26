'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Target, TrendingUp, Zap } from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Seller {
  sellerId:         string
  sellerName:       string | null
  salesCount:       number
  revenueBrl:       number
  commissionBrl:    number
  metaUnlockedCount: number
}

interface Summary {
  revenueBrl:       number
  commissionBrl:    number
  salesCount:       number
  netCommissionBrl: number
  remainingToUnlock: number | null
  metaUnlockedCount: number
  threshold:        number
}

interface ComissaoData {
  month:      string
  self:       Summary | null
  team:       { totalRevenueBrl: number; sellers: Seller[] } | null
  recentSales: Array<{
    id:         string
    paidAt:     string | null
    totalAmount: number
    listingTitle: string
    commissionBrl: number | null
  }>
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const BRLC = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function ComissaoRealtimeClient() {
  const [data, setData]       = useState<ComissaoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdate, setLastUpdate]   = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [summaryRes, quickRes] = await Promise.all([
        fetch('/api/commercial/incentives/summary', { cache: 'no-store' }),
        fetch('/api/admin/pos-venda?limit=10', { cache: 'no-store' }),
      ])

      if (!summaryRes.ok) return

      const summary = await summaryRes.json() as {
        month: string
        self: Summary | null
        team: { totalRevenueBrl: number; sellers: Seller[] } | null
      }

      // Busca vendas recentes do próprio vendedor
      let recentSales: ComissaoData['recentSales'] = []
      if (quickRes.ok) {
        const posVenda = await quickRes.json() as {
          items: Array<{
            id: string
            paidAt: string | null
            totalAmount: number
            listing: { title: string }
            credentials: Array<{ assetStatus: string }>
          }>
        }
        recentSales = posVenda.items.slice(0, 8).map((item) => ({
          id:            item.id,
          paidAt:        item.paidAt,
          totalAmount:   item.totalAmount,
          listingTitle:  item.listing.title,
          commissionBrl: null,
        }))
      }

      setData({ ...summary, recentSales })
      setLastUpdate(new Date())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-refresh a cada 60s
  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [autoRefresh, load])

  if (!data && loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    )
  }

  const self = data?.self
  const metaPct = self && self.threshold > 0
    ? Math.min(100, Math.round((self.revenueBrl / self.threshold) * 100))
    : 0

  return (
    <div className="space-y-5">

      {/* Controles */}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-emerald-500"
            />
            Auto-refresh (60s)
          </label>
          {lastUpdate && <span>Última atualização: {lastUpdate.toLocaleTimeString('pt-BR')}</span>}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* KPIs do mês */}
      {self && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: <TrendingUp className="w-4 h-4 text-emerald-400" />, label: 'Faturamento', value: BRL.format(self.revenueBrl), sub: `${self.salesCount} vendas` },
            { icon: <Zap className="w-4 h-4 text-amber-400" />,         label: 'Comissão Bruta', value: BRLC.format(self.commissionBrl), sub: 'acumulada no mês' },
            { icon: <Target className="w-4 h-4 text-blue-400" />,       label: 'Meta do Mês',    value: BRL.format(self.threshold), sub: `${metaPct}% atingido` },
            { icon: <Zap className="w-4 h-4 text-purple-400" />,        label: 'Metas Desbloq.', value: String(self.metaUnlockedCount), sub: 'vendas acima do piso' },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-1">
              <div className="flex items-center gap-2">
                {k.icon}
                <p className="text-xs text-zinc-500">{k.label}</p>
              </div>
              <p className="text-2xl font-black text-white">{k.value}</p>
              <p className="text-[11px] text-zinc-600">{k.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Barra de meta */}
      {self && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Progresso da Meta Mensal</p>
            <p className={`text-sm font-bold ${metaPct >= 100 ? 'text-emerald-400' : metaPct >= 70 ? 'text-amber-400' : 'text-zinc-400'}`}>
              {metaPct}%
            </p>
          </div>
          <ProgressBar
            value={self.revenueBrl}
            max={self.threshold}
            color={metaPct >= 100 ? 'bg-emerald-500' : metaPct >= 70 ? 'bg-amber-500' : 'bg-blue-500'}
          />
          <div className="flex justify-between text-xs text-zinc-500">
            <span>R$ 0</span>
            {self.remainingToUnlock != null && self.remainingToUnlock > 0 && (
              <span className="text-zinc-400">Faltam {BRLC.format(self.remainingToUnlock)} para desbloquear próxima comissão</span>
            )}
            <span>{BRL.format(self.threshold)}</span>
          </div>
          {metaPct >= 100 && (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-sm text-emerald-300 font-semibold text-center">
              🎉 Meta atingida! Comissão máxima desbloqueada.
            </div>
          )}
        </div>
      )}

      {/* Vendas recentes */}
      {data && data.recentSales.length > 0 && (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <div className="bg-zinc-800/50 px-4 py-2.5">
            <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Vendas Recentes do Mês</p>
          </div>
          <div className="divide-y divide-zinc-800">
            {data.recentSales.map((sale) => (
              <div key={sale.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{sale.listingTitle}</p>
                  <p className="text-[11px] text-zinc-500">
                    {sale.paidAt ? new Date(sale.paidAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </p>
                </div>
                <p className="text-sm font-bold text-emerald-400 shrink-0">
                  {BRLC.format(sale.totalAmount)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ranking da equipe (para managers) */}
      {data?.team && data.team.sellers.length > 0 && (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <div className="bg-zinc-800/50 px-4 py-2.5">
            <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Ranking da Equipe</p>
          </div>
          <div className="divide-y divide-zinc-800">
            {data.team.sellers.map((s, idx) => (
              <div key={s.sellerId} className="px-4 py-3 flex items-center gap-3">
                <span className="text-zinc-600 text-xs w-5 shrink-0">#{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">{s.sellerName ?? s.sellerId}</p>
                  <p className="text-[11px] text-zinc-500">{s.salesCount} vendas</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-white">{BRL.format(s.revenueBrl)}</p>
                  <p className="text-[11px] text-amber-400">{BRLC.format(s.commissionBrl)} comissão</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
