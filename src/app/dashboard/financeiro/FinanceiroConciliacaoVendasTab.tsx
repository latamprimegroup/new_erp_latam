'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, Loader2, RefreshCw,
  DollarSign, ShoppingCart, Zap, FileCheck,
} from 'lucide-react'

type IncomeEntry = {
  id: string
  reconciled: boolean
  entryStatus: string
  value: number
  paymentDate: string | null
}

type SaleRow = {
  orderId:       string
  clientCode:    string | null
  clientName:    string | null
  sellerName:    string | null
  product:       string
  quantity:      number
  value:         number
  currency:      string
  status:        string
  paymentMethod: string | null
  paidAt:        string | null
  createdAt:     string
  incomeEntry:   IncomeEntry | null
  hasBridgeEntry:  boolean
  isReconciled:    boolean
  needsAction:     boolean
}

type Stats = {
  total: number; pending: number; reconciled: number
  noBridge: number; totalValue: number; pendingValue: number
}

const brl   = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fdate = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'

const STATUS_LABELS: Record<string, string> = {
  PAID: 'Pago', IN_SEPARATION: 'Em separação',
  IN_DELIVERY: 'Em entrega', DELIVERED: 'Entregue',
}

export function FinanceiroConciliacaoVendasTab() {
  const [orders, setOrders] = useState<SaleRow[]>([])
  const [stats, setStats]   = useState<Stats | null>(null)
  const [loading, setLoading]     = useState(true)
  const [mode, setMode]           = useState<'pending' | 'all'>('pending')
  const [processing, setProc]     = useState<string | null>(null)
  const [flash, setFlash]         = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [confirmRow, setConfirmRow] = useState<SaleRow | null>(null)
  const [confirmDate, setConfirmDate] = useState(new Date().toISOString().slice(0, 10))
  const [confirmNotes, setConfirmNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/financeiro/conciliacao-vendas?mode=${mode}`)
    if (res.ok) {
      const j = await res.json()
      setOrders(j.orders ?? [])
      setStats(j.stats ?? null)
    }
    setLoading(false)
  }, [mode])

  useEffect(() => { load() }, [load])

  const triggerBridge = async (orderId: string) => {
    setProc(orderId)
    const res = await fetch('/api/financeiro/conciliacao-vendas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    })
    const j = await res.json().catch(() => ({}))
    if (res.ok) {
      setFlash({ type: 'ok', msg: j.skipped ? 'Bridge já executado anteriormente.' : 'Lançamento criado com sucesso!' })
      load()
    } else {
      setFlash({ type: 'err', msg: (j as { error?: string }).error ?? 'Erro ao criar lançamento' })
    }
    setProc(null)
    setTimeout(() => setFlash(null), 5000)
  }

  const confirmReceipt = async () => {
    if (!confirmRow) return
    setProc(confirmRow.orderId)
    const res = await fetch('/api/financeiro/conciliacao-vendas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId:     confirmRow.orderId,
        paymentDate: new Date(confirmDate).toISOString(),
        notes:       confirmNotes || undefined,
      }),
    })
    const j = await res.json().catch(() => ({}))
    if (res.ok) {
      setFlash({ type: 'ok', msg: 'Recebimento confirmado e conciliado!' })
      setConfirmRow(null)
      load()
    } else {
      setFlash({ type: 'err', msg: (j as { error?: string }).error ?? 'Erro ao conciliar' })
    }
    setProc(null)
    setTimeout(() => setFlash(null), 5000)
  }

  return (
    <div className="space-y-5">
      {/* Flash */}
      {flash && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 ${flash.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {flash.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {flash.msg}
        </div>
      )}

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-3">
            <p className="text-[11px] text-zinc-500 mb-1">Total Vendas</p>
            <p className="text-xl font-bold">{stats.total}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3">
            <p className="text-[11px] text-amber-600 font-medium mb-1">Pendentes</p>
            <p className="text-xl font-bold text-amber-700">{stats.pending}</p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 p-3">
            <p className="text-[11px] text-green-600 font-medium mb-1">Conciliadas</p>
            <p className="text-xl font-bold text-green-700">{stats.reconciled}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-3">
            <p className="text-[11px] text-red-600 font-medium mb-1">Sem Lançamento</p>
            <p className="text-xl font-bold text-red-700">{stats.noBridge}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-3">
            <p className="text-[11px] text-zinc-500 mb-1">Receita Total</p>
            <p className="text-lg font-bold text-primary-600">{brl(stats.totalValue)}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3">
            <p className="text-[11px] text-amber-600 font-medium mb-1">Valor Pendente</p>
            <p className="text-lg font-bold text-amber-700">{brl(stats.pendingValue)}</p>
          </div>
        </div>
      )}

      {/* Filtro + refresh */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
          {(['pending', 'all'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === m ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}>
              {m === 'pending' ? '⚠️ Pendentes' : '📋 Todas'}
            </button>
          ))}
        </div>
        <button onClick={load} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <RefreshCw className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {/* Aviso sobre automação */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3 flex gap-2 text-sm text-blue-700 dark:text-blue-300">
        <Zap className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Quando o status de um pedido muda para <strong>PAGO</strong>, o sistema cria automaticamente o lançamento financeiro. Aqui você apenas confirma o recebimento físico.</span>
      </div>

      {loading
        ? <div className="flex justify-center py-12 text-zinc-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />Carregando...</div>
        : orders.length === 0
          ? (
            <div className="rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 p-10 text-center">
              <FileCheck className="w-10 h-10 mx-auto text-green-400 mb-3" />
              <p className="text-zinc-500 font-medium">Nenhuma venda pendente de conciliação</p>
              <p className="text-xs text-zinc-400 mt-1">Tudo conciliado! Ótimo trabalho.</p>
            </div>
          )
          : (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
              {/* Header */}
              <div className="hidden lg:grid grid-cols-12 gap-0 text-[11px] font-bold uppercase tracking-wide text-zinc-500 bg-zinc-50 dark:bg-zinc-900 px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-700">
                <div className="col-span-2">Cliente</div>
                <div className="col-span-2">Produto</div>
                <div className="col-span-1">Status</div>
                <div className="col-span-1">Pagto</div>
                <div className="col-span-2 text-right">Valor</div>
                <div className="col-span-2 text-center">Lançamento</div>
                <div className="col-span-2 text-center">Ação</div>
              </div>

              {orders.map((o) => (
                <div key={o.orderId} className="grid grid-cols-1 lg:grid-cols-12 gap-0 items-center px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                  {/* Cliente */}
                  <div className="lg:col-span-2">
                    <div className="flex items-center gap-1.5">
                      {o.clientCode && (
                        <span className="px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-[10px] font-mono font-bold">{o.clientCode}</span>
                      )}
                    </div>
                    <p className="font-medium text-sm truncate mt-0.5">{o.clientName ?? '—'}</p>
                    {o.sellerName && <p className="text-[10px] text-zinc-400">Vendedor: {o.sellerName}</p>}
                  </div>

                  {/* Produto */}
                  <div className="lg:col-span-2 py-1 lg:py-0">
                    <p className="text-sm truncate">{o.product}</p>
                    <p className="text-[10px] text-zinc-400">Qtd: {o.quantity}</p>
                  </div>

                  {/* Status pedido */}
                  <div className="lg:col-span-1">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
                      {STATUS_LABELS[o.status] ?? o.status}
                    </span>
                  </div>

                  {/* Método + data */}
                  <div className="lg:col-span-1">
                    <p className="text-xs">{o.paymentMethod ?? '—'}</p>
                    <p className="text-[10px] text-zinc-400 flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />{fdate(o.paidAt)}
                    </p>
                  </div>

                  {/* Valor */}
                  <div className="lg:col-span-2 text-right">
                    <p className="font-bold text-base">{brl(o.value)}</p>
                    <p className="text-[10px] text-zinc-400">{o.currency}</p>
                  </div>

                  {/* Status lançamento */}
                  <div className="lg:col-span-2 text-center py-1 lg:py-0">
                    {!o.hasBridgeEntry
                      ? <span className="flex items-center justify-center gap-1 text-[11px] text-red-600 font-medium"><AlertTriangle className="w-3 h-3" />Sem lançamento</span>
                      : o.isReconciled
                      ? <span className="flex items-center justify-center gap-1 text-[11px] text-green-600 font-medium"><CheckCircle2 className="w-3 h-3" />Conciliado</span>
                      : <span className="flex items-center justify-center gap-1 text-[11px] text-amber-600 font-medium"><Clock className="w-3 h-3" />Aguardando</span>
                    }
                  </div>

                  {/* Ações */}
                  <div className="lg:col-span-2 flex justify-center gap-2 py-1 lg:py-0">
                    {!o.hasBridgeEntry && (
                      <button
                        onClick={() => triggerBridge(o.orderId)}
                        disabled={processing === o.orderId}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors disabled:opacity-50">
                        {processing === o.orderId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                        Gerar
                      </button>
                    )}
                    {o.hasBridgeEntry && !o.isReconciled && (
                      <button
                        onClick={() => { setConfirmRow(o); setConfirmDate(new Date().toISOString().slice(0, 10)); setConfirmNotes('') }}
                        disabled={processing === o.orderId}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors disabled:opacity-50">
                        {processing === o.orderId ? <Loader2 className="w-3 h-3 animate-spin" /> : <DollarSign className="w-3 h-3" />}
                        Conciliar
                      </button>
                    )}
                    {o.isReconciled && (
                      <span className="text-[11px] text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />OK
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
      }

      {/* Modal de confirmação de recebimento */}
      {confirmRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-ads-dark-card rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-green-600" /> Confirmar Recebimento
              </h3>
              <button onClick={() => setConfirmRow(null)} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <XCircle className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-3 space-y-1">
              <p className="text-sm font-medium">{confirmRow.clientName}</p>
              <p className="text-xs text-zinc-500">{confirmRow.product} · Qtd {confirmRow.quantity}</p>
              <p className="text-xl font-bold text-green-700">{brl(confirmRow.value)}</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Data do Recebimento</label>
                <input type="date" value={confirmDate} onChange={(e) => setConfirmDate(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Observações (opcional)</label>
                <textarea value={confirmNotes} onChange={(e) => setConfirmNotes(e.target.value)} rows={2} className="input-field" placeholder="Ex: PIX recebido às 14:32 no Inter..." />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={confirmReceipt} disabled={processing === confirmRow.orderId}
                className="btn-primary flex items-center gap-2">
                {processing === confirmRow.orderId ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Confirmar Recebimento
              </button>
              <button onClick={() => setConfirmRow(null)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
