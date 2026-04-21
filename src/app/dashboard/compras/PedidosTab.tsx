'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, AlertTriangle, CheckCircle2, Clock, Loader2, ShoppingCart } from 'lucide-react'

type PurchaseOrder = {
  id: string; totalAmount: number; paidAmount: number; status: string
  paymentDue: string | null; paidAt: string | null; notes: string | null; createdAt: string
  vendor: { id: string; name: string; category: string; rating: number }
  _count: { assets: number }
}

const brl  = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fdate = (d: string) => new Date(d).toLocaleDateString('pt-BR')

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700', PAID: 'bg-green-100 text-green-700',
  PARTIALLY_PAID: 'bg-blue-100 text-blue-700', CANCELED: 'bg-zinc-100 text-zinc-500',
}
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente', PAID: 'Pago', PARTIALLY_PAID: 'Parcialmente Pago', CANCELED: 'Cancelado',
}

export function PedidosTab({ role }: { role: string }) {
  const canWrite = role === 'ADMIN' || role === 'PURCHASING'
  const [orders, setOrders]       = useState<PurchaseOrder[]>([])
  const [total, setTotal]         = useState(0)
  const [overdueCount, setOverdueCount] = useState(0)
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [vendors, setVendors]     = useState<{ id: string; name: string }[]>([])
  const [filterStatus, setFilter] = useState('')
  const [form, setForm] = useState({ vendorId: '', totalAmount: '', paymentDue: '', notes: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams({ limit: '30' })
    if (filterStatus) p.set('status', filterStatus)
    const r = await fetch(`/api/compras/pedidos?${p}`)
    if (r.ok) { const j = await r.json(); setOrders(j.orders ?? []); setTotal(j.total ?? 0); setOverdueCount(j.overdueCount ?? 0) }
    setLoading(false)
  }, [filterStatus])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!canWrite) return
    fetch('/api/compras/fornecedores?limit=100').then((r) => r.json()).then((j) => setVendors(j.vendors?.map((v:{id:string;name:string}) => ({ id: v.id, name: v.name })) ?? []))
  }, [canWrite])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    const r = await fetch('/api/compras/pedidos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId: form.vendorId, totalAmount: parseFloat(form.totalAmount), paymentDue: form.paymentDue ? new Date(form.paymentDue).toISOString() : undefined, notes: form.notes || undefined }),
    })
    if (r.ok) { setShowForm(false); load() }
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      {overdueCount > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/20 p-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <div>
            <p className="font-bold text-red-700 text-sm">{overdueCount} ordem(ns) com pagamento vencido</p>
            <p className="text-xs text-red-500">O envio de ativos fica bloqueado até o financeiro confirmar o pagamento ao fornecedor.</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2">
          {['', 'PENDING', 'PAID', 'PARTIALLY_PAID', 'CANCELED'].map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${filterStatus === s ? 'bg-primary-600 text-white border-primary-600' : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
              {s ? STATUS_LABEL[s] : 'Todos'}
            </button>
          ))}
        </div>
        {canWrite && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus className="w-4 h-4" />Nova Ordem
          </button>
        )}
      </div>

      {showForm && canWrite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-ads-dark-card rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-700 flex justify-between">
              <h2 className="font-bold">Nova Ordem de Compra</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-400 hover:text-zinc-700">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Fornecedor *</label>
                <select required value={form.vendorId} onChange={(e) => setForm((f) => ({ ...f, vendorId: e.target.value }))} className="input-field">
                  <option value="">Selecionar...</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Valor Total (R$) *</label>
                <input required type="number" step="0.01" min="0" value={form.totalAmount} onChange={(e) => setForm((f) => ({ ...f, totalAmount: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Data Limite de Pagamento</label>
                <input type="date" value={form.paymentDue} onChange={(e) => setForm((f) => ({ ...f, paymentDue: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Observações</label>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="input-field resize-none" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Criar Ordem
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading
        ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
        : orders.length === 0
          ? <div className="text-center py-12 text-zinc-400">Nenhuma ordem encontrada</div>
          : (
            <div className="space-y-3">
              {orders.map((o) => {
                const isOverdue = o.status === 'PENDING' && o.paymentDue && new Date(o.paymentDue) < new Date()
                return (
                  <div key={o.id} className={`rounded-2xl border p-4 ${isOverdue ? 'border-red-300 bg-red-50/50 dark:bg-red-950/10' : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card'}`}>
                    <div className="flex items-start gap-4 flex-wrap">
                      <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                        <ShoppingCart className="w-5 h-5 text-zinc-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold">{o.vendor.name}</p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">{o.vendor.category}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                          {isOverdue && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" />VENCIDO</span>}
                        </div>
                        {o.notes && <p className="text-xs text-zinc-500 mt-0.5">{o.notes}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-lg">{brl(o.totalAmount)}</p>
                        {o.paidAmount > 0 && <p className="text-xs text-green-600">Pago: {brl(o.paidAmount)}</p>}
                        <p className="text-[10px] text-zinc-400">{o._count.assets} ativos vinculados</p>
                      </div>
                    </div>
                    {o.paymentDue && (
                      <div className={`mt-3 pt-3 border-t flex items-center gap-1.5 text-xs ${isOverdue ? 'border-red-200 text-red-600' : 'border-zinc-100 dark:border-zinc-700 text-zinc-500'}`}>
                        <Clock className="w-3.5 h-3.5" />
                        Vencimento: {fdate(o.paymentDue)}
                        {o.paidAt && <span className="ml-2 text-green-600">· Pago em {fdate(o.paidAt)}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
      }
    </div>
  )
}
