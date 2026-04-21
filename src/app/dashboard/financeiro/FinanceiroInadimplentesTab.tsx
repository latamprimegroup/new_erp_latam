'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw, Clock, FileText, Phone, Mail } from 'lucide-react'

type OverdueEntry = {
  id: string
  type: string
  category: string
  value: number
  dueDate: string | null
  description: string | null
  financialCategory: { name: string } | null
  wallet: { name: string } | null
}

type OverdueOrder = {
  id: string
  createdAt: string
  status: string
  totalValue?: number
  client: {
    id: string
    clientCode: string | null
    user: { name: string | null; email: string; phone: string | null }
  }
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const daysSince = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
const fmtDate   = (d: string) => new Date(d).toLocaleDateString('pt-BR')

export function FinanceiroInadimplentesTab() {
  const [entries, setEntries]         = useState<OverdueEntry[]>([])
  const [orders, setOrders]           = useState<OverdueOrder[]>([])
  const [totalValue, setTotalValue]   = useState(0)
  const [loading, setLoading]         = useState(true)
  const [activeTab, setActiveTab]     = useState<'entries' | 'orders'>('entries')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/financeiro/inadimplentes')
    if (res.ok) {
      const j = await res.json()
      setEntries(j.overdueEntries ?? [])
      setOrders(j.overdueOrders ?? [])
      setTotalValue(j.totalValueImpact ?? j.totalOverdueValue ?? 0)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-zinc-400">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando inadimplência...
    </div>
  )

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-4">
          <p className="text-xs text-red-600 font-medium mb-1">Valor em Atraso</p>
          <p className="text-2xl font-bold text-red-700">{brl(totalValue)}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-4">
          <p className="text-xs text-zinc-500 mb-1">Lançamentos Vencidos</p>
          <p className="text-2xl font-bold text-amber-600">{entries.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-4">
          <p className="text-xs text-zinc-500 mb-1">Pedidos Sem Entrega</p>
          <p className="text-2xl font-bold text-orange-600">{orders.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-4">
          <p className="text-xs text-zinc-500 mb-1">Total de Ocorrências</p>
          <p className="text-2xl font-bold">{entries.length + orders.length}</p>
        </div>
      </div>

      {/* Sub-abas */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
          {(['entries', 'orders'] as const).map((t) => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === t ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}>
              {t === 'entries' ? `Lançamentos (${entries.length})` : `Pedidos (${orders.length})`}
            </button>
          ))}
        </div>
        <button onClick={load} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <RefreshCw className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {/* Lançamentos vencidos */}
      {activeTab === 'entries' && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          <div className="grid grid-cols-12 gap-0 text-[11px] font-bold uppercase tracking-wide text-zinc-500 bg-zinc-50 dark:bg-zinc-900 px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-700">
            <div className="col-span-4">Descrição</div>
            <div className="col-span-2">Categoria</div>
            <div className="col-span-2">Vencimento</div>
            <div className="col-span-2 text-center">Dias em atraso</div>
            <div className="col-span-2 text-right">Valor</div>
          </div>
          {entries.length === 0
            ? <div className="py-8 text-center text-zinc-400 text-sm">Nenhum lançamento vencido</div>
            : entries.map((e) => {
              const days = e.dueDate ? daysSince(e.dueDate) : 0
              return (
                <div key={e.id} className="grid grid-cols-12 gap-0 items-center px-4 py-3 text-sm border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <div className="col-span-4 pr-2">
                    <p className="font-medium text-sm truncate">{e.description || e.category}</p>
                    {e.wallet && <p className="text-[10px] text-zinc-400">{e.wallet.name}</p>}
                  </div>
                  <div className="col-span-2">
                    <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs">
                      {e.financialCategory?.name ?? e.category}
                    </span>
                  </div>
                  <div className="col-span-2 flex items-center gap-1 text-zinc-500">
                    <Clock className="w-3 h-3" />
                    <span className="text-xs">{e.dueDate ? fmtDate(e.dueDate) : '—'}</span>
                  </div>
                  <div className="col-span-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${days > 30 ? 'bg-red-100 text-red-700' : days > 7 ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700'}`}>
                      {days}d
                    </span>
                  </div>
                  <div className="col-span-2 text-right font-bold text-red-600">
                    {brl(Number(e.value))}
                  </div>
                </div>
              )
            })
          }
        </div>
      )}

      {/* Pedidos sem entrega */}
      {activeTab === 'orders' && (
        <div className="space-y-2">
          {orders.length === 0
            ? <div className="rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 p-8 text-center text-zinc-400 text-sm">Nenhum pedido sem entrega</div>
            : orders.map((o) => {
              const days = daysSince(o.createdAt)
              return (
                <div key={o.id} className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{o.client.user.name ?? o.client.user.email}</span>
                      {o.client.clientCode && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] font-mono">{o.client.clientCode}</span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${days > 14 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {days}d sem entrega
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {o.client.user.email && (
                        <a href={`mailto:${o.client.user.email}`} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-primary-600">
                          <Mail className="w-3 h-3" />{o.client.user.email}
                        </a>
                      )}
                      {o.client.user.phone && (
                        <a href={`tel:${o.client.user.phone}`} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-green-600">
                          <Phone className="w-3 h-3" />{o.client.user.phone}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-zinc-400">Pedido desde</p>
                    <p className="text-sm font-medium">{fmtDate(o.createdAt)}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold mt-0.5 inline-block ${
                      o.status === 'PAID' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                    }`}>{o.status}</span>
                  </div>
                </div>
              )
            })
          }
        </div>
      )}
    </div>
  )
}
