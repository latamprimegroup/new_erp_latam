'use client'

import { useEffect, useState } from 'react'
import {
  Wallet, TrendingUp, TrendingDown, AlertTriangle, Clock,
  DollarSign, CheckCircle2, ArrowUpRight, ArrowDownRight,
  RefreshCw, Loader2, BarChart3, ShieldCheck,
} from 'lucide-react'
import Link from 'next/link'

type WalletData   = { wallets: { name: string; balance: number; currency: string; icon: string | null; color: string | null }[]; totalBalance: number }
type FlowData     = { flow: { income: number; expense: number; balance: number; reconciledCount: number; entryCount: number } }
type OverdueData  = { totalOverdueValue: number; count: { orders: number; entries: number } }
type ConcData     = { stats: { pending: number; pendingValue: number; noBridge: number } }

type VencimentoItem = {
  id: string; type: string; category: string; value: number
  dueDate: string | null; description: string | null
  financialCategory: { name: string } | null
}

const brl = (v: number, currency = 'BRL') =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: currency === 'USD' ? 'USD' : 'BRL' })

const fdate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

const daysUntil = (d: string) => {
  const diff = new Date(d).getTime() - Date.now()
  return Math.ceil(diff / 86400000)
}

export function FinanceiroOverviewTab() {
  const [wallets, setWallets]     = useState<WalletData | null>(null)
  const [flow, setFlow]           = useState<FlowData['flow'] | null>(null)
  const [overdue, setOverdue]     = useState<OverdueData | null>(null)
  const [conc, setConc]           = useState<ConcData['stats'] | null>(null)
  const [vencimentos, setVenc]    = useState<VencimentoItem[]>([])
  const [loading, setLoading]     = useState(true)

  const m = new Date().getMonth() + 1
  const y = new Date().getFullYear()

  useEffect(() => {
    setLoading(true)
    Promise.allSettled([
      fetch('/api/financeiro/carteiras').then((r) => r.json()),
      fetch(`/api/financeiro?month=${m}&year=${y}`).then((r) => r.json()),
      fetch('/api/financeiro/inadimplentes').then((r) => r.json()),
      fetch('/api/financeiro/conciliacao-vendas?mode=pending').then((r) => r.json()),
      // Próximos vencimentos: entradas com dueDate nos próximos 7 dias
      fetch(`/api/financeiro?month=${m}&year=${y}&showDue=true`).then((r) => r.json()),
    ]).then(([w, f, o, c]) => {
      if (w.status === 'fulfilled') setWallets(w.value as WalletData)
      if (f.status === 'fulfilled') setFlow((f.value as FlowData).flow)
      if (o.status === 'fulfilled') setOverdue(o.value as OverdueData)
      if (c.status === 'fulfilled') setConc((c.value as ConcData).stats)
      setLoading(false)
    })
  }, [m, y])

  useEffect(() => {
    // Busca vencimentos dos próximos 7 dias
    const now = new Date()
    const plus7 = new Date(now.getTime() + 7 * 86400000)
    fetch(`/api/financeiro/inadimplentes`)
      .then((r) => r.json())
      .then((d: { overdueEntries?: VencimentoItem[] }) => {
        // Mostra também entries com dueDate nos próximos 7 dias (já vencidos ou a vencer)
        const items = (d.overdueEntries ?? []).filter((e) => e.dueDate && new Date(e.dueDate) <= plus7)
        setVenc(items.slice(0, 5))
      })
      .catch(() => {})
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-zinc-400">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando painel financeiro...
    </div>
  )

  const totalBalance = wallets?.totalBalance ?? 0
  const income       = flow?.income ?? 0
  const expense      = flow?.expense ?? 0
  const balance      = flow?.balance ?? 0
  const overdueVal   = overdue?.totalOverdueValue ?? 0
  const pendConc     = conc?.pending ?? 0
  const pendVal      = conc?.pendingValue ?? 0

  return (
    <div className="space-y-6">
      {/* ── Saldo Consolidado ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Saldo total em conta */}
        <div className="lg:col-span-2 rounded-2xl bg-gradient-to-br from-indigo-600 via-primary-600 to-primary-700 text-white p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-2 opacity-80">
            <Wallet className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Saldo Total em Conta</span>
          </div>
          <p className="text-4xl font-bold">{brl(totalBalance)}</p>
          <div className="mt-3 flex gap-4 text-sm opacity-90">
            {(wallets?.wallets ?? []).slice(0, 3).map((w) => (
              <div key={w.name} className="flex items-center gap-1.5">
                <span>{w.icon ?? '🏦'}</span>
                <span className="truncate max-w-[80px]">{w.name}</span>
                <span className="font-semibold">{brl(w.balance, w.currency)}</span>
              </div>
            ))}
            {(wallets?.wallets?.length ?? 0) > 3 && (
              <span className="opacity-70">+{(wallets?.wallets?.length ?? 0) - 3} carteiras</span>
            )}
          </div>
        </div>

        {/* Receitas do mês */}
        <div className="rounded-2xl border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-5">
          <div className="flex items-center gap-2 mb-2 text-green-600">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Receitas — Mês</span>
          </div>
          <p className="text-2xl font-bold text-green-700">{brl(income)}</p>
          <div className="flex items-center gap-1 mt-2 text-xs text-green-600">
            <ArrowUpRight className="w-3 h-3" />
            <span>Entradas lançadas</span>
          </div>
        </div>

        {/* Despesas do mês */}
        <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-5">
          <div className="flex items-center gap-2 mb-2 text-red-600">
            <TrendingDown className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Despesas — Mês</span>
          </div>
          <p className="text-2xl font-bold text-red-700">{brl(expense)}</p>
          <div className="flex items-center gap-1 mt-2 text-xs text-red-600">
            <ArrowDownRight className="w-3 h-3" />
            <span>Saídas lançadas</span>
          </div>
        </div>
      </div>

      {/* ── KPIs de Ação ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Resultado do mês */}
        <div className={`rounded-xl border p-4 ${balance >= 0 ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20' : 'border-red-200 bg-red-50 dark:bg-red-950/20'}`}>
          <p className="text-xs text-zinc-500 font-medium mb-1">Resultado do Mês</p>
          <p className={`text-2xl font-bold ${balance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{brl(balance)}</p>
          <p className="text-xs text-zinc-400 mt-1">Receitas − Despesas</p>
        </div>

        {/* Inadimplência */}
        <div className={`rounded-xl border p-4 ${overdueVal > 0 ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/20' : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card'}`}>
          <div className="flex items-center gap-1.5 mb-1">
            {overdueVal > 0 && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
            <p className="text-xs text-zinc-500 font-medium">Inadimplência Total</p>
          </div>
          <p className={`text-2xl font-bold ${overdueVal > 0 ? 'text-amber-700' : 'text-zinc-400'}`}>{brl(overdueVal)}</p>
          <p className="text-xs text-zinc-400 mt-1">
            {(overdue?.count.orders ?? 0) + (overdue?.count.entries ?? 0)} ocorrências
          </p>
        </div>

        {/* Conciliação pendente */}
        <div className={`rounded-xl border p-4 ${pendConc > 0 ? 'border-orange-300 bg-orange-50 dark:bg-orange-950/20' : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card'}`}>
          <div className="flex items-center gap-1.5 mb-1">
            {pendConc > 0 && <Clock className="w-3.5 h-3.5 text-orange-600" />}
            <p className="text-xs text-zinc-500 font-medium">Vendas p/ Conciliar</p>
          </div>
          <p className={`text-2xl font-bold ${pendConc > 0 ? 'text-orange-700' : 'text-zinc-400'}`}>{pendConc}</p>
          <p className="text-xs text-zinc-400 mt-1">{brl(pendVal)} aguardando</p>
        </div>
      </div>

      {/* ── Próximos Vencimentos (7 dias) ───────────────────────────── */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" /> Próximos Vencimentos — 7 dias
          </h3>
          <Link href="?tab=inadimplentes" className="text-xs text-primary-600 hover:underline">
            Ver todos →
          </Link>
        </div>
        {vencimentos.length === 0
          ? (
            <div className="py-6 text-center">
              <CheckCircle2 className="w-8 h-8 mx-auto text-green-400 mb-2" />
              <p className="text-sm text-zinc-500">Nenhum vencimento nos próximos 7 dias</p>
            </div>
          )
          : (
            <div>
              {vencimentos.map((v) => {
                const days = v.dueDate ? daysUntil(v.dueDate) : 0
                return (
                  <div key={v.id} className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${days < 0 ? 'bg-red-500' : days === 0 ? 'bg-orange-500' : 'bg-amber-400'}`} />
                      <div>
                        <p className="text-sm font-medium">{v.description || v.category}</p>
                        <p className="text-xs text-zinc-400">{v.financialCategory?.name ?? v.category}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm text-red-600">{brl(Number(v.value))}</p>
                      <p className="text-[10px] text-zinc-400">
                        {v.dueDate ? fdate(v.dueDate) : '—'}
                        {days < 0 && <span className="text-red-500 ml-1">({Math.abs(days)}d atraso)</span>}
                        {days === 0 && <span className="text-orange-500 ml-1">(hoje)</span>}
                        {days > 0 && <span className="text-amber-500 ml-1">(em {days}d)</span>}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        }
      </div>

      {/* ── Ações Rápidas ───────────────────────────────────────────── */}
      <div>
        <h3 className="font-semibold text-sm text-zinc-500 uppercase tracking-wide mb-3">Ações Rápidas</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: DollarSign,  label: 'Lançar Receita',    color: 'bg-green-100 text-green-700 dark:bg-green-900/30', tab: 'lancamentos' },
            { icon: BarChart3,   label: 'Ver DRE do Mês',    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30',   tab: 'dre' },
            { icon: CheckCircle2,label: 'Conciliar Vendas',  color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30', tab: 'conciliacao_vendas' },
            { icon: ShieldCheck, label: 'Fluxo de Caixa',    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30', tab: 'projecao' },
          ].map(({ icon: Icon, label, color, tab }) => (
            <button key={tab}
              onClick={() => {
                const url = new URL(window.location.href)
                url.searchParams.set('tab', tab)
                window.history.pushState({}, '', url)
                // Tenta forçar rerender via evento customizado
                window.dispatchEvent(new CustomEvent('financeTabChange', { detail: tab }))
              }}
              className={`rounded-xl p-4 text-left transition-all hover:shadow-md border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 ${color}`}>
              <Icon className="w-5 h-5 mb-2" />
              <p className="text-sm font-semibold">{label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Status do Sistema ───────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-primary-500" />
          <h3 className="font-semibold text-sm">Status do Sistema Financeiro</h3>
          <RefreshCw className="w-3 h-3 text-zinc-400 ml-auto cursor-pointer hover:text-zinc-600" onClick={() => window.location.reload()} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {[
            { label: 'Carteiras Ativas', value: wallets?.wallets.length ?? 0, ok: (wallets?.wallets.length ?? 0) > 0 },
            { label: 'Lançamentos/Mês', value: flow?.entryCount ?? 0, ok: true },
            { label: 'Conciliados',      value: flow?.reconciledCount ?? 0, ok: true },
            { label: 'Vendas Pendentes', value: pendConc, ok: pendConc === 0 },
          ].map(({ label, value, ok }) => (
            <div key={label} className="flex items-center gap-2 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900">
              <span className={`w-2 h-2 rounded-full ${ok ? 'bg-green-500' : 'bg-amber-500'}`} />
              <div>
                <p className="text-[10px] text-zinc-400">{label}</p>
                <p className="font-bold text-sm">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
