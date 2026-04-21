'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, Loader2, ChevronRight, Lock, Unlock, RefreshCw, Copy, CheckCheck } from 'lucide-react'

type Order = {
  id: string; status: string; negotiatedPrice: number; grossMargin?: number; grossMarginPct?: number
  belowFloor: boolean; clientName: string | null; clientContact: string | null
  createdAt: string; clientPaidAt: string | null; vendorPaidAt: string | null; deliveredAt: string | null
  notes: string | null
  asset:  { adsId: string; category: string; displayName: string; subCategory: string | null; status: string }
  seller: { name: string | null; email: string }
}

type Credentials = { adsId: string; displayName: string; credentials: Record<string, unknown>; warning: string }

type ByStatus = Record<string, number>

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fdt = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: 'Aguard. Pgto. Cliente', PENDING_APPROVAL: 'Aprovação CEO', APPROVED: 'Aprovado',
  CLIENT_PAID: 'Cliente Pagou', VENDOR_PAYMENT_SENT: 'Pgto. Fornecedor Enviado',
  VENDOR_PAID: 'Fornecedor Pago', DELIVERING: 'Em Entrega', DELIVERED: 'Entregue', CANCELED: 'Cancelado',
}
const STATUS_COLOR: Record<string, string> = {
  AWAITING_PAYMENT: 'bg-blue-100 text-blue-700', PENDING_APPROVAL: 'bg-red-100 text-red-700',
  APPROVED: 'bg-teal-100 text-teal-700', CLIENT_PAID: 'bg-amber-100 text-amber-700',
  VENDOR_PAYMENT_SENT: 'bg-orange-100 text-orange-700', VENDOR_PAID: 'bg-violet-100 text-violet-700',
  DELIVERING: 'bg-indigo-100 text-indigo-700', DELIVERED: 'bg-green-100 text-green-700',
  CANCELED: 'bg-zinc-100 text-zinc-500',
}

// Próximos passos por status
const NEXT_ACTIONS: Record<string, { label: string; status: string; roles: string[]; variant: 'primary' | 'danger' | 'success' }[]> = {
  PENDING_APPROVAL:    [{ label: '✅ Aprovar', status: 'APPROVED', roles: ['ADMIN'], variant: 'success' }, { label: '❌ Cancelar', status: 'CANCELED', roles: ['ADMIN', 'COMMERCIAL'], variant: 'danger' }],
  APPROVED:            [{ label: '▶️ Aguardar Pgto.', status: 'AWAITING_PAYMENT', roles: ['ADMIN', 'COMMERCIAL'], variant: 'primary' }],
  AWAITING_PAYMENT:    [{ label: '💰 Cliente Pagou', status: 'CLIENT_PAID', roles: ['ADMIN', 'FINANCE', 'COMMERCIAL'], variant: 'success' }, { label: '❌ Cancelar', status: 'CANCELED', roles: ['ADMIN', 'FINANCE', 'COMMERCIAL'], variant: 'danger' }],
  CLIENT_PAID:         [{ label: '📤 Pgto. Enviado ao Fornec.', status: 'VENDOR_PAYMENT_SENT', roles: ['ADMIN', 'FINANCE'], variant: 'primary' }],
  VENDOR_PAYMENT_SENT: [{ label: '✅ Fornecedor Confirmou', status: 'VENDOR_PAID', roles: ['ADMIN', 'FINANCE'], variant: 'success' }],
  VENDOR_PAID:         [{ label: '🚚 Iniciar Entrega', status: 'DELIVERING', roles: ['ADMIN', 'DELIVERER'], variant: 'primary' }],
  DELIVERING:          [{ label: '✅ Entrega Concluída', status: 'DELIVERED', roles: ['ADMIN', 'DELIVERER'], variant: 'success' }],
}

export function OrdensComerciais({ role }: { role: string }) {
  const hasSensitive = role === 'ADMIN' || role === 'FINANCE' || role === 'PURCHASING'

  const [orders, setOrders]   = useState<Order[]>([])
  const [byStatus, setByStatus] = useState<ByStatus>({})
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('')
  const [selected, setSelected] = useState<Order | null>(null)
  const [transitioning, setTransitioning] = useState(false)
  const [creds, setCreds]     = useState<Credentials | null>(null)
  const [credsLoading, setCredsLoading] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams({ limit: '30' })
    if (filter) p.set('status', filter)
    const r = await fetch(`/api/vendas/ativos/orders?${p}`)
    if (r.ok) { const j = await r.json(); setOrders(j.orders ?? []); setByStatus(j.byStatus ?? {}); setTotal(j.total ?? 0) }
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  const transition = async (orderId: string, status: string, notes?: string) => {
    setTransitioning(true)
    const r = await fetch(`/api/vendas/ativos/orders/${orderId}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes }),
    })
    if (r.ok) { setSelected(null); load() }
    setTransitioning(false)
  }

  const loadCredentials = async (orderId: string) => {
    setCredsLoading(true); setCreds(null)
    const r = await fetch(`/api/vendas/ativos/orders/${orderId}/credentials`)
    if (r.ok) setCreds(await r.json())
    setCredsLoading(false)
  }

  const copyToClipboard = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopiedKey(key); setTimeout(() => setCopiedKey(null), 2000)
  }

  const canShowCredentials = (o: Order) => (role === 'ADMIN' || role === 'DELIVERER') && ['VENDOR_PAID','DELIVERING','DELIVERED'].includes(o.status)

  return (
    <div className="space-y-4">
      {/* Filtros por status */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <button onClick={() => setFilter('')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${!filter ? 'bg-primary-600 text-white border-primary-600' : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50'}`}>
          Todas ({total})
        </button>
        {Object.entries(STATUS_LABEL).map(([s, l]) => {
          const count = byStatus[s] ?? 0
          if (!count && filter !== s) return null
          return (
            <button key={s} onClick={() => setFilter(s === filter ? '' : s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${filter === s ? 'ring-2 ring-primary-500' : ''} ${STATUS_COLOR[s] ?? 'bg-zinc-100'}`}>
              {l} ({count})
            </button>
          )
        })}
        <button onClick={load} className="ml-auto p-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700">
          <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
        </button>
      </div>

      {/* Lista */}
      {loading
        ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
        : orders.length === 0
          ? <div className="text-center py-12 text-zinc-400">Nenhuma ordem encontrada</div>
          : (
            <div className="space-y-3">
              {orders.map((o) => (
                <div key={o.id}
                  className={`rounded-2xl border p-4 cursor-pointer hover:shadow-md transition-shadow ${o.status === 'PENDING_APPROVAL' ? 'border-red-300 bg-red-50/50 dark:bg-red-950/10' : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card'}`}
                  onClick={() => setSelected(selected?.id === o.id ? null : o)}>
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-primary-600">{o.asset.adsId}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                        {o.belowFloor && <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" />Abaixo Piso</span>}
                      </div>
                      <p className="text-sm font-medium mt-0.5 truncate">{o.asset.displayName}</p>
                      <p className="text-xs text-zinc-400">{o.clientName ?? 'Cliente não informado'} · {o.seller.name ?? o.seller.email}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-lg text-primary-600">{brl(o.negotiatedPrice)}</p>
                      {hasSensitive && o.grossMargin != null && (
                        <p className="text-xs text-green-600">Margem: {brl(o.grossMargin)} ({o.grossMarginPct?.toFixed(1)}%)</p>
                      )}
                      <p className="text-[10px] text-zinc-400">{fdt(o.createdAt)}</p>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform ${selected?.id === o.id ? 'rotate-90' : ''}`} />
                  </div>

                  {/* Expansão */}
                  {selected?.id === o.id && (
                    <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-3" onClick={(e) => e.stopPropagation()}>
                      {/* Timeline */}
                      <div className="flex gap-3 text-xs flex-wrap">
                        {o.clientPaidAt  && <div className="text-green-600">💰 Cliente: {fdt(o.clientPaidAt)}</div>}
                        {o.vendorPaidAt  && <div className="text-violet-600">✅ Fornecedor: {fdt(o.vendorPaidAt)}</div>}
                        {o.deliveredAt   && <div className="text-zinc-500">📦 Entregue: {fdt(o.deliveredAt)}</div>}
                        {o.clientContact && <div className="text-zinc-500">📞 {o.clientContact}</div>}
                        {o.notes         && <div className="text-zinc-500 italic">{o.notes}</div>}
                      </div>

                      {/* Ações de transição */}
                      {(NEXT_ACTIONS[o.status] ?? []).map((action) => {
                        if (!action.roles.includes(role)) return null
                        return (
                          <button key={action.status} disabled={transitioning}
                            onClick={() => transition(o.id, action.status)}
                            className={`w-full py-2.5 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${action.variant === 'success' ? 'bg-green-600 hover:bg-green-700 text-white' : action.variant === 'danger' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-primary-600 hover:bg-primary-700 text-white'}`}>
                            {transitioning ? <Loader2 className="w-4 h-4 animate-spin" /> : action.label}
                          </button>
                        )
                      })}

                      {/* Credenciais (DELIVERER/ADMIN após vendor pago) */}
                      {canShowCredentials(o) && (
                        <div>
                          <button onClick={() => loadCredentials(o.id)} disabled={credsLoading}
                            className="w-full py-2.5 rounded-xl border border-violet-300 bg-violet-50 dark:bg-violet-950/20 text-violet-700 font-bold text-sm flex items-center justify-center gap-2">
                            {credsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : creds ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                            {creds ? 'Ocultar Credenciais' : '🔓 Acessar Credenciais'}
                          </button>

                          {creds && (
                            <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
                              <p className="text-xs font-bold text-amber-700 flex items-center gap-1">⚠️ {creds.warning}</p>
                              {Object.entries(creds.credentials).map(([k, v]) => (
                                <div key={k} className="flex items-center justify-between gap-2 bg-white dark:bg-zinc-900 rounded-lg px-3 py-2 border border-amber-200">
                                  <div>
                                    <p className="text-[10px] text-zinc-500 uppercase font-semibold">{k}</p>
                                    <p className="text-sm font-mono">{String(v)}</p>
                                  </div>
                                  <button onClick={() => copyToClipboard(k, String(v))} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                                    {copiedKey === k ? <CheckCheck className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
      }
    </div>
  )
}
