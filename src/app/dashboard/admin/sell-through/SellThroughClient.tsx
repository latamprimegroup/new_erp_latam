'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Package, RefreshCw, TrendingUp } from 'lucide-react'

interface CategoryItem {
  category:       string
  categoryLabel:  string
  available:      number
  soldLast7d:     number
  dailyRate:      number
  daysOfCoverage: number | null
  alert:          boolean
  topProduct:     { title: string; units: number } | null
}

interface SellThroughData {
  generatedAt: string
  lookbackDays: number
  summary: {
    totalAvailable:  number
    totalSold7d:     number
    alertCount:      number
    dailyAvgAll:     number
  }
  items: CategoryItem[]
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

function CoverageBar({ days }: { days: number | null }) {
  if (days === null) return <p className="text-zinc-600 text-xs">Sem vendas recentes</p>
  const capped = Math.min(days, 30)
  const color  = days < 3 ? 'bg-red-500' : days < 7 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="space-y-1">
      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${(capped / 30) * 100}%` }} />
      </div>
      <p className={`text-xs font-semibold ${days < 3 ? 'text-red-400' : days < 7 ? 'text-amber-400' : 'text-emerald-400'}`}>
        {days < 999 ? `${days} dias` : '∞'}
      </p>
    </div>
  )
}

export function SellThroughClient() {
  const [data, setData]     = useState<SellThroughData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/sell-through', { cache: 'no-store' })
      if (res.ok) setData(await res.json() as SellThroughData)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading && !data) {
    return <div className="flex items-center justify-center py-16"><RefreshCw className="w-6 h-6 text-zinc-500 animate-spin" /></div>
  }

  const s = data?.summary

  return (
    <div className="space-y-5">

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: <Package className="w-4 h-4 text-zinc-400" />,        label: 'Estoque Total',  value: String(s?.totalAvailable ?? 0) },
          { icon: <TrendingUp className="w-4 h-4 text-emerald-400" />,  label: 'Vendas 7d',     value: String(s?.totalSold7d ?? 0) },
          { icon: <TrendingUp className="w-4 h-4 text-blue-400" />,     label: 'Média/dia',     value: String(s?.dailyAvgAll ?? 0) },
          { icon: <AlertTriangle className="w-4 h-4 text-red-400" />,   label: 'Alertas',       value: String(s?.alertCount ?? 0) },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 flex items-center gap-3">
            {k.icon}
            <div>
              <p className="text-xs text-zinc-500">{k.label}</p>
              <p className="text-xl font-black text-white">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Alertas críticos */}
      {data?.items.filter((i) => i.alert).map((item) => (
        <div key={item.category} className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-300">
              ⚠️ Estoque crítico — {item.categoryLabel}
            </p>
            <p className="text-xs text-zinc-400">
              {item.available} unidades restantes · {item.daysOfCoverage} dias de cobertura no ritmo atual de {item.dailyRate} vendas/dia.
              Solicitar reabastecimento imediato.
            </p>
          </div>
        </div>
      ))}

      {/* Tabela por categoria */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <div className="bg-zinc-800/50 px-4 py-3 grid grid-cols-[1fr_80px_80px_80px_120px] gap-4 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          <span>Categoria</span>
          <span className="text-right">Estoque</span>
          <span className="text-right">Vendidos 7d</span>
          <span className="text-right">Média/dia</span>
          <span>Cobertura</span>
        </div>
        <div className="divide-y divide-zinc-800">
          {data?.items.map((item) => (
            <div
              key={item.category}
              className={`px-4 py-3 grid grid-cols-[1fr_80px_80px_80px_120px] gap-4 items-center ${item.alert ? 'bg-red-500/5' : ''}`}
            >
              <div>
                <div className="flex items-center gap-2">
                  {item.alert
                    ? <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  }
                  <p className="text-sm font-semibold text-white">{item.categoryLabel}</p>
                </div>
                {item.topProduct && (
                  <p className="text-[11px] text-zinc-500 mt-0.5 pl-5 truncate">
                    Top: {item.topProduct.title} ({item.topProduct.units} un)
                  </p>
                )}
              </div>
              <p className="text-sm text-white font-bold text-right">{item.available}</p>
              <p className="text-sm text-emerald-400 font-bold text-right">{item.soldLast7d}</p>
              <p className="text-sm text-zinc-300 text-right">{item.dailyRate}</p>
              <CoverageBar days={item.daysOfCoverage} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-600">
          Dados dos últimos {data?.lookbackDays ?? 7} dias · Atualizado {data ? new Date(data.generatedAt).toLocaleTimeString('pt-BR') : '—'}
        </p>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition disabled:opacity-50">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

    </div>
  )
}
