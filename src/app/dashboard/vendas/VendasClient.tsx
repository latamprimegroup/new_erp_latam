'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ReputationCard } from '@/components/dashboard/ReputationCard'

type Client = {
  id: string
  clientCode?: string | null
  user: { name: string | null; email: string }
}

type Reputation = {
  score: number | null
  refundCount: number
  nicheTag: string | null
  plugPlayErrorCount: number
  averageAccountLifetimeDays: number | null
}

type ClientLTV = {
  reputation?: Reputation | null
  client: {
    id: string
    clientCode?: string | null
    user: { name: string | null; email: string; phone: string | null }
    whatsapp: string | null
    country: string | null
    lastPurchaseAt: string | null
    totalSpent: number
    totalAccountsBought: number
    ordersCount: number
  }
  orders: Array<{
    id: string
    product: string
    accountType: string
    quantity: number
    value: number
    status: string
    paidAt: string | null
    createdAt: string
  }>
  accountsDelivered: Array<{
    id: string
    platform: string
    type: string
    deliveredAt: string | null
    email?: string | null
    cnpj?: string | null
  }>
}

type Order = {
  id: string
  product: string
  accountType: string
  quantity: number
  value: number
  currency?: string
  status: string
  createdAt: string
  warrantyUiStatus?: string
  replacementCount?: number
  client: { id: string; user: { name: string | null; email: string } }
  seller: { name: string | null } | null
}

const WARRANTY_BADGE: Record<string, string> = {
  SEM_PAGAMENTO: '—',
  VIGENTE: 'Garantia OK',
  EXPIRADA: 'Garantia off',
  REIVINDICADA: 'Reposição',
}

function ReputationBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return null
  const badge = score >= 80 ? 'VIP' : score >= 50 ? 'Regular' : 'High Risk'
  const style =
    badge === 'VIP'
      ? 'bg-emerald-100 text-emerald-800'
      : badge === 'Regular'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-red-100 text-red-800'
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${style}`}>
      {badge === 'VIP' ? '🟢 VIP' : badge === 'Regular' ? '🟡 Regular' : '🔴 High Risk'}
    </span>
  )
}

function ClientLTVCard({ ltv, loading }: { ltv: ClientLTV | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
        <div className="h-12 bg-gray-100 rounded" />
      </div>
    )
  }
  if (!ltv) return null

  const { client, orders, accountsDelivered } = ltv
  const lastPurchase = client.lastPurchaseAt
    ? new Date(client.lastPurchaseAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'

  const rep = ltv.reputation
  const score = rep?.score ?? null
  const isHighRisk = score != null && score < 50

  return (
    <div className="p-4 bg-[#F8FAFC] rounded-lg border border-primary-600/10">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-semibold text-[#1F2937] text-sm">
          Dados do cliente para LTV
          {client.clientCode != null && client.clientCode !== '' && (
            <span className="ml-2 font-mono text-primary-700 bg-primary-50/80 px-2 py-0.5 rounded text-xs">
              {client.clientCode}
            </span>
          )}
        </h3>
        {score != null && (
          <span className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Score:</span>
            <ReputationBadge score={score} />
            <span className="text-gray-600">({score}/100)</span>
          </span>
        )}
      </div>
      {isHighRisk && (
        <div className="mb-3 p-2 rounded bg-red-50 border border-red-200 text-red-800 text-sm">
          ⚠️ Venda de contas G2 Premium bloqueada para este cliente (High Risk)
        </div>
      )}
      <div className="mb-3">
        <ReputationCard
          score={score}
          averageAccountLifetimeDays={rep?.averageAccountLifetimeDays}
          nicheTag={rep?.nicheTag}
          refundCount={rep?.refundCount}
          plugPlayErrorCount={rep?.plugPlayErrorCount}
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <span className="text-gray-500 block">Última compra</span>
          <span className="font-medium">{lastPurchase}</span>
        </div>
        <div>
          <span className="text-gray-500 block">Total gasto</span>
          <span className="font-medium text-primary-600">
            R$ {client.totalSpent.toLocaleString('pt-BR')}
          </span>
        </div>
        <div>
          <span className="text-gray-500 block">Contas compradas</span>
          <span className="font-medium">{client.totalAccountsBought}</span>
        </div>
        <div>
          <span className="text-gray-500 block">Pedidos</span>
          <span className="font-medium">{client.ordersCount}</span>
        </div>
      </div>
      {accountsDelivered.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-500 mb-2">
            Contas/IDs entregues ({accountsDelivered.length})
          </p>
          <div className="max-h-24 overflow-y-auto space-y-1 text-xs">
            {accountsDelivered.slice(0, 10).map((a) => (
              <div key={a.id} className="flex gap-2 flex-wrap">
                <span className="font-mono text-primary-600">{a.id.slice(0, 8)}</span>
                <span className="text-gray-600">
                  {a.platform} — {a.email || a.cnpj || '—'}
                </span>
              </div>
            ))}
            {accountsDelivered.length > 10 && (
              <p className="text-gray-400">+{accountsDelivered.length - 10} outras</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const STATUS_LABELS: Record<string, string> = {
  QUOTE: 'Cotação',
  AWAITING_PAYMENT: 'Aguard. pagamento',
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  PAID: 'Pago',
  IN_SEPARATION: 'Em separação',
  IN_DELIVERY: 'Em entrega',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
}

export function VendasClient() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const highlightOrderId = searchParams.get('orderId')
  const highlightRef = useRef<HTMLTableRowElement | null>(null)
  const canCreateOrder = session?.user?.role === 'ADMIN' || session?.user?.role === 'COMMERCIAL'

  const [orders, setOrders] = useState<Order[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [kpis, setKpis] = useState({ revenue: 0, pending: 0, completed: 0 })
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [form, setForm] = useState({
    clientId: '',
    country: '',
    product: '',
    accountType: '',
    quantity: 1,
    value: 0,
    currency: 'BRL' as 'BRL' | 'USD',
    discountCode: '',
    deliveryMethod: '' as '' | 'ADSPOWER_SHARE' | 'SPREADSHEET' | 'ERP_DIRECT',
    unitValue: '' as string | number,
    fxRateBrlToUsd: '' as string | number,
    paymentMethod: '' as
      | ''
      | 'BANK_TRANSFER'
      | 'STRIPE'
      | 'CRYPTO'
      | 'LEAD_BANK'
      | 'PIX'
      | 'OUTRO',
    paymentReferenceMemo: '',
    documentationUrl: '',
    saleUseNiche: '',
    warrantyHours: 48,
    deliveredAssetIdsText: '',
    externalRef: '',
  })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [clientLtv, setClientLtv] = useState<ClientLTV | null>(null)
  const [ltvLoading, setLtvLoading] = useState(false)

  const loadOrders = useCallback(async () => {
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    if (highlightOrderId) params.set('orderId', highlightOrderId)
    const res = await fetch(`/api/vendas?${params}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setOrders(Array.isArray(data.orders) ? data.orders : [])
      setKpis(data.kpis ?? { revenue: 0, pending: 0, completed: 0 })
    }
  }, [filterStatus, highlightOrderId])

  const loadClients = useCallback(async () => {
    const res = await fetch('/api/clientes')
    const data = await res.json()
    if (res.ok) setClients(Array.isArray(data) ? data : (data.clients ?? []))
  }, [])

  useEffect(() => {
    if (!form.clientId) {
      setClientLtv(null)
      return
    }
    setLtvLoading(true)
    fetch(`/api/clientes/${form.clientId}/ltv`)
      .then((r) => r.json())
      .then((d) => setClientLtv(d?.client ? d : null))
      .catch(() => setClientLtv(null))
      .finally(() => setLtvLoading(false))
  }, [form.clientId])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadOrders(), loadClients()]).finally(() => setLoading(false))
  }, [loadOrders, loadClients])

  useEffect(() => {
    if (!highlightOrderId || !highlightRef.current) return
    highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightOrderId, orders])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const unitVal =
      form.unitValue === '' || form.unitValue === undefined ? undefined : Number(form.unitValue)
    const fx = form.fxRateBrlToUsd === '' || form.fxRateBrlToUsd === undefined
      ? undefined
      : Number(form.fxRateBrlToUsd)
    const res = await fetch('/api/vendas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: form.clientId,
        country: form.country || undefined,
        product: form.product,
        accountType: form.accountType,
        quantity: Number(form.quantity),
        value: Number(form.value),
        currency: form.currency,
        discountCode: form.discountCode || undefined,
        deliveryMethod: form.deliveryMethod || undefined,
        unitValue: unitVal,
        fxRateBrlToUsd: fx,
        paymentMethod: form.paymentMethod || undefined,
        paymentReferenceMemo: form.paymentReferenceMemo || undefined,
        documentationUrl: form.documentationUrl || undefined,
        saleUseNiche: form.saleUseNiche || undefined,
        warrantyHours: Number(form.warrantyHours) || 48,
        deliveredAssetIdsText: form.deliveredAssetIdsText || undefined,
        externalRef: form.externalRef || undefined,
      }),
    })
    if (res.ok) {
      setForm({
        clientId: '',
        country: '',
        product: '',
        accountType: '',
        quantity: 1,
        value: 0,
        currency: 'BRL',
        discountCode: '',
        deliveryMethod: '',
        unitValue: '',
        fxRateBrlToUsd: '',
        paymentMethod: '',
        paymentReferenceMemo: '',
        documentationUrl: '',
        saleUseNiche: '',
        warrantyHours: 48,
        deliveredAssetIdsText: '',
        externalRef: '',
      })
      setShowForm(false)
      loadOrders()
    } else {
      const err = await res.json()
      alert(err.error || 'Erro ao registrar')
    }
    setSubmitting(false)
  }

  return (
    <div>
      <div className="flex flex-col gap-2 mb-6">
        <h1 className="heading-1">Vendas</h1>
        {session?.user?.role === 'FINANCE' && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Acesso somente leitura — registro de pedidos é feito pelo time comercial.
          </p>
        )}
        {['ADMIN', 'COMMERCIAL', 'FINANCE'].includes(session?.user?.role || '') && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Cruzamento de vendas com mídia e CRM:{' '}
            <Link href="/dashboard/roi-crm" className="text-primary-600 dark:text-primary-400 font-medium hover:underline">
              Dashboard ROI & CRM
            </Link>
          </p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card">
          <p className="text-sm text-gray-500">Receita (pedidos entregues)</p>
          <p className="text-2xl font-bold">
            {loading ? '—' : `R$ ${kpis.revenue.toLocaleString('pt-BR')}`}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            Soma em BRL no banco; pedidos em USD entram convertidos apenas se gravados assim no valor.
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Pedidos Pendentes</p>
          <p className="text-2xl font-bold">{loading ? '—' : kpis.pending}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Pedidos Concluídos</p>
          <p className="text-2xl font-bold">{loading ? '—' : kpis.completed}</p>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          <h2 className="font-semibold">Tabela de Vendas</h2>
          <div className="flex gap-2 items-center">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input-field py-1.5 px-2 w-40 text-sm"
            >
              <option value="">Todos status</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            {canCreateOrder && (
              <button type="button" onClick={() => setShowForm(!showForm)} className="btn-primary">
                {showForm ? 'Cancelar' : 'Registrar Venda'}
              </button>
            )}
          </div>
        </div>

        {showForm && canCreateOrder && (
          <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-3 border border-primary-600/5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Cliente *</label>
                <select
                  value={form.clientId}
                  onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                  className="input-field"
                  required
                >
                  <option value="">Selecione...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.clientCode ? `${c.clientCode} — ` : ''}
                      {c.user.name || c.user.email}
                    </option>
                  ))}
                </select>
              </div>
              {form.clientId && (
                <div className="md:col-span-2 lg:col-span-3">
                  <ClientLTVCard ltv={clientLtv} loading={ltvLoading} />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">País</label>
                <input
                  type="text"
                  value={form.country}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                  className="input-field"
                  placeholder="Brasil"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Produto *</label>
                <input
                  type="text"
                  value={form.product}
                  onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
                  className="input-field"
                  placeholder="Conta Google Ads"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tipo de conta *</label>
                <input
                  type="text"
                  value={form.accountType}
                  onChange={(e) => setForm((f) => ({ ...f, accountType: e.target.value }))}
                  className="input-field"
                  placeholder="Ads USD"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Quantidade *</label>
                <input
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) || 1 }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Valor total *</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.value || ''}
                  onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) || 0 }))}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Moeda</label>
                <select
                  value={form.currency}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, currency: e.target.value as 'BRL' | 'USD' }))
                  }
                  className="input-field"
                >
                  <option value="BRL">BRL</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Cupom / código</label>
                <input
                  type="text"
                  value={form.discountCode}
                  onChange={(e) => setForm((f) => ({ ...f, discountCode: e.target.value }))}
                  className="input-field"
                  placeholder="Opcional"
                />
              </div>
            </div>

            <button
              type="button"
              className="text-sm text-primary-600 font-medium"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? 'Ocultar' : 'Mostrar'} campos War Room OS (entrega, financeiro, IDs)
            </button>

            {showAdvanced && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 border-t border-gray-200 dark:border-white/10">
                <div>
                  <label className="block text-sm font-medium mb-1">Método de entrega</label>
                  <select
                    value={form.deliveryMethod}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        deliveryMethod: e.target.value as typeof form.deliveryMethod,
                      }))
                    }
                    className="input-field"
                  >
                    <option value="">—</option>
                    <option value="ADSPOWER_SHARE">AdsPower Share</option>
                    <option value="SPREADSHEET">Planilha</option>
                    <option value="ERP_DIRECT">Direto no ERP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Valor unitário (opcional)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.unitValue}
                    onChange={(e) => setForm((f) => ({ ...f, unitValue: e.target.value }))}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Câmbio BRL→USD (opcional)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.00000001}
                    value={form.fxRateBrlToUsd}
                    onChange={(e) => setForm((f) => ({ ...f, fxRateBrlToUsd: e.target.value }))}
                    className="input-field"
                    placeholder="Matriz EUA"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Meio de pagamento</label>
                  <select
                    value={form.paymentMethod}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        paymentMethod: e.target.value as typeof form.paymentMethod,
                      }))
                    }
                    className="input-field"
                  >
                    <option value="">—</option>
                    <option value="BANK_TRANSFER">Transferência</option>
                    <option value="STRIPE">Stripe</option>
                    <option value="CRYPTO">Crypto</option>
                    <option value="LEAD_BANK">Lead Bank</option>
                    <option value="PIX">PIX</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Memo / referência pagamento</label>
                  <input
                    type="text"
                    value={form.paymentReferenceMemo}
                    onChange={(e) => setForm((f) => ({ ...f, paymentReferenceMemo: e.target.value }))}
                    className="input-field"
                    maxLength={120}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Link documentação</label>
                  <input
                    type="url"
                    value={form.documentationUrl}
                    onChange={(e) => setForm((f) => ({ ...f, documentationUrl: e.target.value }))}
                    className="input-field"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Nicho de uso (venda)</label>
                  <input
                    type="text"
                    value={form.saleUseNiche}
                    onChange={(e) => setForm((f) => ({ ...f, saleUseNiche: e.target.value }))}
                    className="input-field"
                    placeholder="Black, Health, iGaming…"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Garantia (horas)</label>
                  <input
                    type="number"
                    min={1}
                    max={8760}
                    value={form.warrantyHours}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, warrantyHours: Number(e.target.value) || 48 }))
                    }
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Ref. externa / afiliado</label>
                  <input
                    type="text"
                    value={form.externalRef}
                    onChange={(e) => setForm((f) => ({ ...f, externalRef: e.target.value }))}
                    className="input-field"
                    maxLength={120}
                  />
                </div>
                <div className="md:col-span-2 lg:col-span-3">
                  <label className="block text-sm font-medium mb-1">
                    IDs dos ativos (Ads / AdsPower / BM) — um por linha ou separados por vírgula
                  </label>
                  <textarea
                    value={form.deliveredAssetIdsText}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, deliveredAssetIdsText: e.target.value }))
                    }
                    className="input-field w-full min-h-[88px] text-sm font-mono"
                    placeholder="profile_abc&#10;BM-12345"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? 'Salvando...' : 'Salvar'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                Cancelar
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          {loading ? (
            <p className="text-gray-500 py-4">Carregando...</p>
          ) : orders.length === 0 ? (
            <p className="text-gray-400 py-4">Nenhum pedido ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">ID</th>
                  <th className="pb-2 pr-4">Cliente</th>
                  <th className="pb-2 pr-4">Produto</th>
                  <th className="pb-2 pr-4">Qtd</th>
                  <th className="pb-2 pr-4">Valor</th>
                  <th className="pb-2 pr-4">Moeda</th>
                  <th className="pb-2 pr-4">Garantia</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Ficha</th>
                  <th className="pb-2">Vendedor</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    ref={o.id === highlightOrderId ? highlightRef : undefined}
                    className={`border-b border-gray-100 dark:border-white/5 last:border-0 ${
                      o.id === highlightOrderId
                        ? 'ring-2 ring-inset ring-primary-500 bg-primary-50/80 dark:bg-primary-950/40'
                        : ''
                    }`}
                  >
                    <td className="py-3 pr-4 font-mono text-xs">{o.id.slice(0, 8)}</td>
                    <td className="py-3 pr-4">{o.client.user.name || o.client.user.email}</td>
                    <td className="py-3 pr-4">{o.product} ({o.accountType})</td>
                    <td className="py-3 pr-4">{o.quantity}</td>
                    <td className="py-3 pr-4 font-mono text-xs">
                      {o.currency === 'USD' ? 'US$' : 'R$'}{' '}
                      {Number(o.value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 pr-4 text-xs">{o.currency || 'BRL'}</td>
                    <td className="py-3 pr-4 text-xs">
                      {o.warrantyUiStatus
                        ? WARRANTY_BADGE[o.warrantyUiStatus] || o.warrantyUiStatus
                        : '—'}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-white/10">
                        {STATUS_LABELS[o.status] || o.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <Link
                        href={`/dashboard/commercial/cliente-war-room/${o.client.id}`}
                        className="text-primary-600 dark:text-primary-400 text-xs font-medium hover:underline whitespace-nowrap"
                      >
                        War Room
                      </Link>
                    </td>
                    <td className="py-3">{o.seller?.name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
