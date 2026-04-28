'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Clock, Mail, Package, RefreshCw, Send, Shield, Truck } from 'lucide-react'

const BRLC = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })

const FLOW_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING_PAYMENT:    { label: 'Aguard. pagamento', color: 'text-zinc-400', icon: <Clock className="w-3.5 h-3.5" /> },
  PENDING_KYC:        { label: 'KYC pendente',      color: 'text-amber-400', icon: <Shield className="w-3.5 h-3.5" /> },
  WAITING_CUSTOMER_DATA: { label: 'Aguard. dados AdsPower', color: 'text-blue-400', icon: <Mail className="w-3.5 h-3.5" /> },
  DELIVERY_REQUESTED: { label: 'Entrega solicitada', color: 'text-purple-400', icon: <Package className="w-3.5 h-3.5" /> },
  DELIVERY_IN_PROGRESS: { label: 'Em andamento',   color: 'text-amber-400', icon: <Truck className="w-3.5 h-3.5" /> },
  DELIVERED:          { label: 'Entregue ✅',        color: 'text-emerald-400', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
}

interface Order {
  id: string
  paidAt: string | null
  buyerName: string
  buyerWhatsapp: string
  buyerEmail: string | null
  totalAmount: number
  qty: number
  warrantyEndsAt: string | null
  deliveryFlowStatus: string
  adspowerEmail: string | null
  adspowerProfileReleased: boolean
  deliverySent: boolean
  listing: { title: string; slug: string }
  seller: { name: string | null } | null
}

function StatusBadge({ status }: { status: string }) {
  const cfg = FLOW_LABELS[status] ?? { label: status, color: 'text-zinc-400', icon: null }
  return (
    <span className={`flex items-center gap-1 text-xs font-semibold ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  )
}

export function VendasAprovadasClient({ userRole }: { userRole: string }) {
  const canDeliver = ['ADMIN', 'CEO', 'DELIVERER'].includes(userRole)

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('WAITING_CUSTOMER_DATA')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [adspowerInput, setAdspowerInput] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [statusSaving, setStatusSaving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (statusFilter) params.set('status', statusFilter)
      if (search) params.set('q', search)
      const res = await fetch(`/api/admin/vendas-aprovadas?${params}`, { cache: 'no-store' })
      if (res.ok) setOrders(await res.json() as Order[])
    } finally {
      setLoading(false)
    }
  }, [statusFilter, search])

  useEffect(() => { load() }, [load])

  const saveAdspowerEmail = async (orderId: string) => {
    if (!adspowerInput.trim()) return
    setSaving(orderId)
    try {
      await fetch(`/api/admin/vendas-aprovadas/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adspowerEmail: adspowerInput.trim(), adspowerProfileReleased: true }),
      })
      setExpandedId(null)
      setAdspowerInput('')
      await load()
    } finally {
      setSaving(null)
    }
  }

  const updateStatus = async (orderId: string, newStatus: string) => {
    setStatusSaving(orderId)
    try {
      await fetch(`/api/admin/vendas-aprovadas/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryFlowStatus: newStatus }),
      })
      await load()
    } finally {
      setStatusSaving(null)
    }
  }

  const sendWhatsappUpdate = (order: Order) => {
    const phone = order.buyerWhatsapp.replace(/\D/g, '')
    const status = FLOW_LABELS[order.deliveryFlowStatus]?.label ?? order.deliveryFlowStatus
    const msg = [
      `✅ *Atualização do seu pedido — Ads Ativos*`,
      ``,
      `Produto: *${order.listing.title}*`,
      `Status: *${status}*`,
      ``,
      order.adspowerEmail ? `📧 E-mail AdsPower registrado: ${order.adspowerEmail}` : '',
      ``,
      `_Ads Ativos — War Room OS_`,
    ].filter(Boolean).join('\n')
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')
  }

  const pending = orders.filter(o => o.deliveryFlowStatus !== 'DELIVERED').length
  const delivered = orders.filter(o => o.deliveryFlowStatus === 'DELIVERED').length

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 flex items-center gap-3">
          <Package className="w-4 h-4 text-blue-400" />
          <div><p className="text-xs text-zinc-500">Pendentes</p><p className="text-xl font-black text-white">{pending}</p></div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <div><p className="text-xs text-zinc-500">Entregues</p><p className="text-xl font-black text-white">{delivered}</p></div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 flex items-center gap-3">
          <Mail className="w-4 h-4 text-amber-400" />
          <div><p className="text-xs text-zinc-500">Aguard. dados</p><p className="text-xl font-black text-white">{orders.filter(o => o.deliveryFlowStatus === 'WAITING_CUSTOMER_DATA').length}</p></div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <input
          className="input-dark flex-1 min-w-48 text-sm"
          placeholder="Buscar por nome, WhatsApp..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input-dark text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Todos os status</option>
          {Object.entries(FLOW_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <button onClick={load} disabled={loading} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {loading && orders.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 text-zinc-500 animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-12">Nenhuma venda encontrada.</p>
        ) : orders.map((order) => (
          <div key={order.id} className={`rounded-2xl border p-4 space-y-3 transition ${
            order.deliveryFlowStatus === 'DELIVERED'
              ? 'border-zinc-800/50 bg-zinc-900/20 opacity-70'
              : 'border-zinc-800 bg-zinc-900/40'
          }`}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-white">{order.buyerName}</p>
                  <StatusBadge status={order.deliveryFlowStatus} />
                </div>
                <p className="text-zinc-500 text-xs mt-0.5">{order.buyerWhatsapp} {order.buyerEmail ? `· ${order.buyerEmail}` : ''}</p>
                <p className="text-zinc-400 text-sm mt-1">{order.listing.title} · {order.qty}x · <span className="text-emerald-400 font-semibold">{BRLC.format(order.totalAmount)}</span></p>
                {order.paidAt && <p className="text-zinc-600 text-xs">Pago em {new Date(order.paidAt).toLocaleString('pt-BR')}</p>}
                {order.warrantyEndsAt && (
                  <p className={`text-xs mt-0.5 ${new Date(order.warrantyEndsAt) > new Date() ? 'text-emerald-500' : 'text-zinc-600'}`}>
                    <Shield className="w-3 h-3 inline mr-1" />
                    Garantia até {new Date(order.warrantyEndsAt).toLocaleDateString('pt-BR')}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5 items-end shrink-0">
                <button
                  onClick={() => sendWhatsappUpdate(order)}
                  className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
                >
                  <Send className="w-3.5 h-3.5" /> WhatsApp
                </button>
                {canDeliver && order.deliveryFlowStatus !== 'DELIVERED' && (
                  <button
                    onClick={() => { setExpandedId(expandedId === order.id ? null : order.id); setAdspowerInput(order.adspowerEmail ?? '') }}
                    className="text-xs text-zinc-400 hover:text-white border border-zinc-700 px-2 py-1 rounded-lg"
                  >
                    {expandedId === order.id ? 'Fechar' : 'Gerenciar'}
                  </button>
                )}
              </div>
            </div>

            {/* AdsPower email atual */}
            {order.adspowerEmail && (
              <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 px-3 py-2 text-xs">
                <p className="text-blue-300">📧 AdsPower: <span className="font-mono text-white">{order.adspowerEmail}</span></p>
              </div>
            )}

            {/* Painel de gerenciamento */}
            {expandedId === order.id && canDeliver && (
              <div className="border-t border-zinc-700 pt-3 space-y-3">
                {/* Entrada do e-mail AdsPower */}
                {!order.adspowerEmail && (
                  <div className="space-y-2">
                    <label className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wide">E-mail AdsPower do cliente</label>
                    <div className="flex gap-2">
                      <input
                        className="input-dark text-sm flex-1"
                        placeholder="cliente@adspower.com"
                        value={adspowerInput}
                        onChange={(e) => setAdspowerInput(e.target.value)}
                      />
                      <button
                        onClick={() => saveAdspowerEmail(order.id)}
                        disabled={saving === order.id || !adspowerInput.trim()}
                        className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50"
                      >
                        {saving === order.id ? '...' : 'Salvar'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Atualizar status */}
                <div className="space-y-2">
                  <label className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wide">Atualizar status de entrega</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'DELIVERY_IN_PROGRESS', label: '🚀 Em andamento' },
                      { key: 'DELIVERED',            label: '✅ Entregue' },
                    ].map((s) => (
                      <button
                        key={s.key}
                        disabled={statusSaving === order.id || order.deliveryFlowStatus === s.key}
                        onClick={() => updateStatus(order.id, s.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                          order.deliveryFlowStatus === s.key
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                        } disabled:opacity-50`}
                      >
                        {statusSaving === order.id ? '...' : s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
