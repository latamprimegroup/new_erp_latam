'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  TrendingUp, TrendingDown, AlertTriangle, Clock, DollarSign,
  CheckCircle2, ArrowUpRight, ArrowDownRight, Loader2,
  Users, Zap, MessageCircle, Phone, RefreshCw, XCircle,
  ChevronRight, Wallet,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type RecebivelEntry = {
  id: string; type: string; category: string; value: number
  entryStatus: string; dueDate: string | null; description: string | null
  order: {
    id: string; product: string; quantity: number; status: string
    paymentMethod: string | null; paidAt: string | null
    client: {
      clientCode: string | null
      user: { name: string | null; email: string; phone: string | null }
    } | null
    seller: { name: string | null; email: string } | null
  } | null
  wallet: { name: string; icon: string | null } | null
}

type RecebiveisSummary = { pending: { count: number; value: number }; overdue: { count: number; value: number }; total: { count: number; value: number } }

type ComissaoEntry = {
  id: string; value: number; entryStatus: string; date: string
  description: string | null; costCenter: string | null
  order: {
    id: string; product: string; value: number
    client: { clientCode: string | null; user: { name: string | null } } | null
  } | null
  seller: { id: string; name: string | null; email: string; phone: string | null; commissionRate: number | null } | null
}

type BySeller = { sellerName: string; pendingTotal: number; paidTotal: number; entries: ComissaoEntry[] }

type OverdueEntry = {
  id: string; value: number; dueDate: string | null; description: string | null; category: string
  financialCategory: { name: string } | null
}

type OverdueOrder = {
  id: string; createdAt: string; status: string
  client: { id: string; clientCode: string | null; user: { name: string | null; email: string; phone: string | null } }
}

type FlowData = { income: number; expense: number; balance: number; reconciledCount: number; entryCount: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fdate = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—'
const daysOverdue = (d: string) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000))
const daysUntil = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)

const STATUS_PILL: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  OVERDUE: 'bg-red-100 text-red-700',
  PAID:    'bg-green-100 text-green-700',
}

// ─── Painel 1: Pipeline de Recebíveis ────────────────────────────────────────

function PipelineRecebiveis({ onTabChange }: { onTabChange: (t: string) => void }) {
  const [entries, setEntries]   = useState<RecebivelEntry[]>([])
  const [summary, setSummary]   = useState<RecebiveisSummary | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState<string | null>(null)
  const [flash, setFlash]       = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/financeiro/recebiveis?limit=8')
    if (r.ok) { const j = await r.json(); setEntries(j.entries ?? []); setSummary(j.summary) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const confirmar = async (id: string) => {
    setSaving(id)
    const r = await fetch('/api/financeiro/conciliacao-vendas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: id }),
    })
    if (r.ok) { setFlash('Recebimento confirmado!'); load() }
    setSaving(null)
    setTimeout(() => setFlash(null), 3000)
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-primary-600 to-indigo-600 text-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          <span className="font-semibold text-sm">Pipeline de Recebíveis</span>
        </div>
        {summary && (
          <div className="flex gap-3 text-xs">
            <span className="bg-white/20 px-2 py-0.5 rounded-full">{summary.pending.count} pendentes</span>
            {summary.overdue.count > 0 && (
              <span className="bg-red-400/80 px-2 py-0.5 rounded-full">{summary.overdue.count} vencidos</span>
            )}
          </div>
        )}
      </div>

      {/* KPI bar */}
      {summary && (
        <div className="grid grid-cols-3 divide-x divide-zinc-100 dark:divide-zinc-800 border-b border-zinc-100 dark:border-zinc-800">
          <div className="px-3 py-2 text-center">
            <p className="text-[10px] text-zinc-500 uppercase font-semibold">A Receber</p>
            <p className="font-bold text-sm text-primary-600">{brl(summary.pending.value)}</p>
          </div>
          <div className="px-3 py-2 text-center">
            <p className="text-[10px] text-red-500 uppercase font-semibold">Em Atraso</p>
            <p className="font-bold text-sm text-red-600">{brl(summary.overdue.value)}</p>
          </div>
          <div className="px-3 py-2 text-center">
            <p className="text-[10px] text-zinc-500 uppercase font-semibold">Total</p>
            <p className="font-bold text-sm">{brl(summary.total.value)}</p>
          </div>
        </div>
      )}

      {/* Flash */}
      {flash && (
        <div className="mx-4 mt-2 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs px-3 py-1.5 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />{flash}
        </div>
      )}

      {/* Lista */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-50 dark:divide-zinc-800/80">
        {loading
          ? <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-zinc-400" /></div>
          : entries.length === 0
            ? <div className="py-8 text-center text-sm text-zinc-400">Nenhum recebível pendente</div>
            : entries.map((e) => {
              const days = e.dueDate ? (e.entryStatus === 'OVERDUE' ? daysOverdue(e.dueDate) : daysUntil(e.dueDate)) : null
              return (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {e.order?.client?.clientCode && (
                        <span className="px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 text-[10px] font-mono font-bold">{e.order.client.clientCode}</span>
                      )}
                      <span className="font-medium text-xs truncate">{e.order?.client?.user?.name ?? e.description ?? '—'}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_PILL[e.entryStatus] ?? 'bg-zinc-100 text-zinc-600'}`}>
                        {e.entryStatus === 'OVERDUE' ? `${days}d atraso` : e.entryStatus === 'PENDING' && days !== null ? `vence em ${days}d` : e.entryStatus}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-0.5">{e.order?.product ?? e.category} · {fdate(e.dueDate)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm text-primary-600">{brl(Number(e.value))}</p>
                    {e.order?.id && (
                      <button onClick={() => e.order?.id && confirmar(e.order.id)} disabled={saving === e.order?.id}
                        className="text-[10px] text-green-600 hover:underline flex items-center gap-0.5 ml-auto">
                        {saving === e.order?.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <CheckCircle2 className="w-2.5 h-2.5" />}
                        Confirmar
                      </button>
                    )}
                  </div>
                </div>
              )
            })
        }
      </div>

      {/* Footer */}
      <button onClick={() => onTabChange('conciliacao_vendas')}
        className="flex items-center justify-center gap-1 text-xs text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 py-2.5 border-t border-zinc-100 dark:border-zinc-800 transition-colors">
        Ver todos os recebíveis <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── Painel 2: Gestão de Comissões ──────────────────────────────────────────

function GestaoComissoes() {
  const [bySeller, setBySeller] = useState<BySeller[]>([])
  const [summary, setSummary]   = useState<{ pending: { count: number; value: number }; paid: { count: number; value: number } } | null>(null)
  const [loading, setLoading]   = useState(true)
  const [paying, setPaying]     = useState<string | null>(null)
  const [flash, setFlash]       = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/financeiro/comissoes')
    if (r.ok) { const j = await r.json(); setBySeller(j.bySeller ?? []); setSummary(j.summary) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const liquidar = async (entryId: string) => {
    setPaying(entryId)
    const r = await fetch(`/api/financeiro/comissoes/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentDate: new Date().toISOString() }),
    })
    if (r.ok) { setFlash({ type: 'ok', msg: 'Comissão liquidada com sucesso!' }); load() }
    else { const e = await r.json().catch(() => ({})); setFlash({ type: 'err', msg: (e as { error?: string }).error ?? 'Erro' }) }
    setPaying(null)
    setTimeout(() => setFlash(null), 4000)
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4" />
          <span className="font-semibold text-sm">Gestão de Comissões</span>
        </div>
        <button onClick={load} className="p-1 hover:bg-white/20 rounded transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* KPI bar */}
      {summary && (
        <div className="grid grid-cols-2 divide-x divide-zinc-100 dark:divide-zinc-800 border-b border-zinc-100 dark:border-zinc-800">
          <div className="px-3 py-2 text-center">
            <p className="text-[10px] text-amber-500 uppercase font-semibold">A Pagar</p>
            <p className="font-bold text-sm text-amber-600">{brl(summary.pending.value)}</p>
            <p className="text-[10px] text-zinc-400">{summary.pending.count} comissões</p>
          </div>
          <div className="px-3 py-2 text-center">
            <p className="text-[10px] text-green-500 uppercase font-semibold">Pagas</p>
            <p className="font-bold text-sm text-green-600">{brl(summary.paid.value)}</p>
            <p className="text-[10px] text-zinc-400">{summary.paid.count} liquidadas</p>
          </div>
        </div>
      )}

      {flash && (
        <div className={`mx-4 mt-2 rounded-lg text-xs px-3 py-1.5 flex items-center gap-1 ${flash.type === 'ok' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {flash.type === 'ok' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}{flash.msg}
        </div>
      )}

      {/* Lista por vendedor */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-50 dark:divide-zinc-800/80">
        {loading
          ? <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-zinc-400" /></div>
          : bySeller.length === 0
            ? <div className="py-8 text-center text-sm text-zinc-400">Nenhuma comissão registrada</div>
            : bySeller.map((s) => {
              const isOpen  = expanded === s.sellerName
              const pending = s.entries.filter((e) => e.entryStatus === 'PENDING')
              return (
                <div key={s.sellerName}>
                  <button onClick={() => setExpanded(isOpen ? null : s.sellerName)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors text-left">
                    <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-violet-700">{s.sellerName.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs truncate">{s.sellerName}</p>
                      <p className="text-[10px] text-zinc-400">{pending.length} pendentes</p>
                    </div>
                    <div className="text-right shrink-0">
                      {s.pendingTotal > 0 && <p className="font-bold text-xs text-amber-600">{brl(s.pendingTotal)}</p>}
                      {s.paidTotal > 0 && <p className="text-[10px] text-zinc-400">{brl(s.paidTotal)} pago</p>}
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  </button>

                  {isOpen && (
                    <div className="bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800">
                      {s.entries.map((e) => (
                        <div key={e.id} className="flex items-center gap-2 px-6 py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] text-zinc-500 truncate">{e.order?.product ?? '—'} · {e.order?.client?.user?.name ?? '—'}</p>
                            <p className="text-[10px] text-zinc-400">{new Date(e.date).toLocaleDateString('pt-BR')}</p>
                          </div>
                          <p className="font-bold text-xs shrink-0">{brl(e.value)}</p>
                          {e.entryStatus === 'PENDING'
                            ? (
                              <button onClick={() => liquidar(e.id)} disabled={paying === e.id}
                                className="px-2 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-bold transition-colors disabled:opacity-50 flex items-center gap-1 shrink-0">
                                {paying === e.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <DollarSign className="w-2.5 h-2.5" />}
                                Pagar
                              </button>
                            )
                            : <span className="text-[10px] text-green-600 font-semibold flex items-center gap-0.5 shrink-0"><CheckCircle2 className="w-2.5 h-2.5" />Pago</span>
                          }
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
        }
      </div>
    </div>
  )
}

// ─── Painel 3: Botão de Conciliação ─────────────────────────────────────────

function PainelConciliacao({ onTabChange }: { onTabChange: (t: string) => void }) {
  const [stats, setStats]   = useState<{ pending: number; pendingValue: number; noBridge: number; reconciled: number; total: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/financeiro/conciliacao-vendas?mode=all')
      .then((r) => r.json())
      .then((j: { stats?: typeof stats }) => setStats(j.stats ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const pct = stats && stats.total > 0 ? Math.round((stats.reconciled / stats.total) * 100) : 0

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card overflow-hidden flex flex-col">
      <div className="px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center gap-2">
        <Zap className="w-4 h-4" />
        <span className="font-semibold text-sm">Conciliação Bancária</span>
      </div>

      <div className="p-5 flex-1 flex flex-col gap-4">
        {/* Progress */}
        {loading
          ? <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-zinc-400" /></div>
          : stats && (
            <>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-500">Progresso do mês</span>
                  <span className="font-bold text-emerald-600">{pct}%</span>
                </div>
                <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-zinc-400 mt-1">
                  <span>{stats.reconciled} conciliados</span>
                  <span>{stats.pending} pendentes</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 p-3 text-center">
                  <p className="text-[10px] text-amber-600 font-semibold uppercase mb-1">Sem Lançamento</p>
                  <p className="text-2xl font-bold text-amber-700">{stats.noBridge}</p>
                </div>
                <div className="rounded-xl bg-orange-50 dark:bg-orange-950/20 border border-orange-200 p-3 text-center">
                  <p className="text-[10px] text-orange-600 font-semibold uppercase mb-1">Aguardando</p>
                  <p className="text-2xl font-bold text-orange-700">{stats.pending}</p>
                  <p className="text-[10px] text-orange-400">{brl(stats.pendingValue)}</p>
                </div>
              </div>
            </>
          )
        }

        {/* CTA */}
        <button
          onClick={() => onTabChange('conciliacao_vendas')}
          className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 mt-auto">
          <Zap className="w-4 h-4" />
          Abrir Conciliação
        </button>

        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-2.5 text-[10px] text-blue-700 dark:text-blue-300">
          💡 Ao marcar como "Pago", o sistema gera automaticamente o lançamento no DRE e atualiza o fluxo de caixa.
        </div>
      </div>
    </div>
  )
}

// ─── Painel 4: Alerta de Inadimplência ───────────────────────────────────────

function AlertaInadimplencia({ onTabChange }: { onTabChange: (t: string) => void }) {
  const [entries, setEntries]   = useState<OverdueEntry[]>([])
  const [orders, setOrders]     = useState<OverdueOrder[]>([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    fetch('/api/financeiro/inadimplentes')
      .then((r) => r.json())
      .then((j: { overdueEntries?: OverdueEntry[]; overdueOrders?: OverdueOrder[]; totalOverdueValue?: number }) => {
        setEntries((j.overdueEntries ?? []).slice(0, 5))
        setOrders((j.overdueOrders ?? []).slice(0, 4))
        setTotal(j.totalOverdueValue ?? 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const totalCount = entries.length + orders.length

  return (
    <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-white dark:bg-ads-dark-card overflow-hidden flex flex-col">
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between ${totalCount > 0 ? 'bg-gradient-to-r from-red-600 to-rose-600' : 'bg-gradient-to-r from-zinc-500 to-zinc-600'} text-white`}>
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span className="font-semibold text-sm">Alerta de Inadimplência</span>
        </div>
        {totalCount > 0 && (
          <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs font-bold">
            {totalCount} alertas
          </span>
        )}
      </div>

      {/* KPI */}
      {total > 0 && (
        <div className="px-4 py-2 border-b border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-950/10">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-600" />
            <span className="text-xs text-red-600 font-medium">Total em atraso:</span>
            <span className="font-bold text-red-700">{brl(total)}</span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto divide-y divide-zinc-50 dark:divide-zinc-800/80">
        {loading
          ? <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-zinc-400" /></div>
          : totalCount === 0
            ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="w-8 h-8 mx-auto text-green-400 mb-2" />
                <p className="text-sm text-zinc-400 font-medium">Sem inadimplências</p>
              </div>
            )
            : (
              <>
                {/* Clientes sem entrega */}
                {orders.map((o) => {
                  const days = Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 86400000)
                  return (
                    <div key={o.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-red-50/50 dark:hover:bg-red-950/10 transition-colors">
                      <div className="w-7 h-7 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {o.client.clientCode && (
                            <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-mono">{o.client.clientCode}</span>
                          )}
                          <span className="font-medium text-xs truncate">{o.client.user.name ?? o.client.user.email}</span>
                        </div>
                        <p className="text-[10px] text-zinc-400">{days}d sem entrega · {o.status}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {o.client.user.phone && (
                          <a href={`https://wa.me/55${o.client.user.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                            className="p-1.5 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 transition-colors" title="WhatsApp">
                            <MessageCircle className="w-3 h-3" />
                          </a>
                        )}
                        <a href={`mailto:${o.client.user.email}`}
                          className="p-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 transition-colors" title="E-mail">
                          <Phone className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )
                })}

                {/* Lançamentos vencidos */}
                {entries.map((e) => {
                  const days = e.dueDate ? daysOverdue(e.dueDate) : 0
                  return (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-amber-50/50 dark:hover:bg-amber-950/10 transition-colors">
                      <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs truncate">{e.description ?? e.category}</p>
                        <p className="text-[10px] text-zinc-400">{e.financialCategory?.name ?? e.category} · {days}d em atraso</p>
                      </div>
                      <p className="font-bold text-xs text-red-600 shrink-0">{brl(Number(e.value))}</p>
                    </div>
                  )
                })}
              </>
            )
        }
      </div>

      <button onClick={() => onTabChange('inadimplentes')}
        className="flex items-center justify-center gap-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 py-2.5 border-t border-red-100 dark:border-red-900/30 transition-colors">
        Ver relatório completo <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── KPIs de Topo ────────────────────────────────────────────────────────────

function KpiStrip() {
  const [flow, setFlow]   = useState<FlowData | null>(null)
  const [total, setTotal] = useState(0)

  const m = new Date().getMonth() + 1
  const y = new Date().getFullYear()

  useEffect(() => {
    Promise.allSettled([
      fetch(`/api/financeiro?month=${m}&year=${y}`).then((r) => r.json()),
      fetch('/api/financeiro/carteiras').then((r) => r.json()),
    ]).then(([f, w]) => {
      if (f.status === 'fulfilled') setFlow((f.value as { flow?: FlowData }).flow ?? null)
      if (w.status === 'fulfilled') setTotal((w.value as { totalBalance?: number }).totalBalance ?? 0)
    })
  }, [m, y])

  const income  = flow?.income  ?? 0
  const expense = flow?.expense ?? 0
  const balance = flow?.balance ?? 0

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-3">
        <div className="flex items-center gap-1.5 mb-1 text-zinc-500">
          <Wallet className="w-3.5 h-3.5" />
          <span className="text-[10px] font-semibold uppercase">Saldo em Conta</span>
        </div>
        <p className="text-xl font-bold text-primary-600">{brl(total)}</p>
      </div>
      <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 p-3">
        <div className="flex items-center gap-1.5 mb-1 text-green-600">
          <ArrowUpRight className="w-3.5 h-3.5" />
          <span className="text-[10px] font-semibold uppercase">Receitas/Mês</span>
        </div>
        <p className="text-xl font-bold text-green-700">{brl(income)}</p>
      </div>
      <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-3">
        <div className="flex items-center gap-1.5 mb-1 text-red-600">
          <ArrowDownRight className="w-3.5 h-3.5" />
          <span className="text-[10px] font-semibold uppercase">Despesas/Mês</span>
        </div>
        <p className="text-xl font-bold text-red-700">{brl(expense)}</p>
      </div>
      <div className={`rounded-xl border p-3 ${balance >= 0 ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20' : 'border-red-200 bg-red-50 dark:bg-red-950/20'}`}>
        <div className={`flex items-center gap-1.5 mb-1 ${balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          <TrendingUp className="w-3.5 h-3.5" />
          <span className="text-[10px] font-semibold uppercase">Resultado/Mês</span>
        </div>
        <p className={`text-xl font-bold ${balance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{brl(balance)}</p>
      </div>
    </div>
  )
}

// ─── Componente Principal ────────────────────────────────────────────────────

export function FinanceiroOverviewTab({ onTabChange }: { onTabChange?: (tab: string) => void }) {
  const changeTab = onTabChange ?? ((t: string) => {
    // Fallback: dispara evento customizado capturado pelo FinanceiroClient
    window.dispatchEvent(new CustomEvent('financeTabChange', { detail: t }))
  })

  return (
    <div className="space-y-5">
      {/* Barra de KPIs */}
      <KpiStrip />

      {/* Aviso de segregação */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 px-4 py-2.5 flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>
          <strong>Acesso restrito:</strong> dados cadastrais (CNPJ, CPF) são somente leitura. Alterações exigem aprovação do Administrador.
        </span>
      </div>

      {/* Grid dos 4 painéis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <PipelineRecebiveis onTabChange={changeTab} />
        <GestaoComissoes />
        <PainelConciliacao onTabChange={changeTab} />
        <AlertaInadimplencia onTabChange={changeTab} />
      </div>
    </div>
  )
}
