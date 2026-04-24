'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { getPublicAppBaseUrl } from '@/lib/public-app-url'
import { VendaRapidaTab } from '@/app/dashboard/compras/VendaRapidaTab'

type Stats = {
  faturamento24h: number
  pedidosPagos24h: number
  faturamentoDiaCalendario?: number
  pedidosPagosDiaCalendario?: number
  ticketMedioDiaCalendario?: number
  ticketMedio24h: number
  ticketMedioMes: number
  faturamentoMes: number
  pedidosPagosMes?: number
  pedidosPendentes?: number
  forecastFimMes?: number
  diasNoMes?: number
  diaAtual?: number
  ticketMedioPorLinha?: { accountType: string; pedidos: number; faturamento: number; ticketMedio: number }[]
  performanceVendedoresMes?: { sellerId: string | null; nome: string; faturamento: number; pedidos: number }[]
  churnClientes30d: number
  taxaConversaoPedido30d: number
  taxaConversaoLeads30d: number | null
  leadsFunil30d: number
  leadsConvertidos30d?: number
  metaFaturamentoMensal: number
  progressMetaFaturamentoPct: number
  metasGlobaisVendasUnidades: { meta: number; atual: number; percentual: number }
  inventory: {
    totalAvailable: number
    byType: { type: string; count: number }[]
    byPlatformType: { label: string; platform: string; type: string; count: number }[]
  }
  upsellAlerts: string[]
  tintimTintim?: {
    webhookHits30d: number
    leadEvents30d: number
    salesPaid30d: number
    conversionLeadToSalePct: number | null
    followUpPendente: {
      orderId: string
      product: string
      paidAt: string
      clientEmail: string
      clientName: string | null
    }[]
  }
}

type IncentiveSummary = {
  monthStart: string
  targetBrl: number
  totalApprovedBrl: number
  progressPct: number
  remainingToUnlockBrl: number
  unlocked: boolean
  sellerCommissionPct: number
  managerOverridePct: number
  productionUnitBonusBrl: number
  productionManagerBonusBrl: number
  topSellers?: {
    sellerId: string
    sellerName: string
    approvedAmountBrl: number
    sellerCommissionBrl: number
    managerCommissionBrl: number
    unlocked: boolean
  }[]
}

type IncentiveStatementRow = {
  orderId: string
  paidAt: string
  clientName: string | null
  grossBrl: number
  sellerCommissionBrl: number
  managerCommissionBrl: number
  supplierCostBrl: number
  netProfitBrl: number
}

type GateOrder = {
  id: string
  product: string
  accountType: string
  quantity: number
  value: { toString: () => string } | number | string
  status: string
  createdAt: string
  client: { id: string; user: { name: string | null; email: string; phone: string | null } }
  seller: { name: string | null; email: string } | null
}

type CrmRow = {
  id: string
  clientCode: string | null
  name: string | null
  email: string
  phone: string | null
  whatsapp: string | null
  totalSpent: number
  lastPurchaseAt: string | null
  whale: string
  alertRepescagem15d: boolean
  alertRisco7d?: boolean
  commercialNotes: string | null
  lastContactDate: string | null
  reputationScore?: number | null
  averageAccountLifetimeDays?: number | null
  refundCount?: number
  nicheTag?: string | null
  plugPlayErrorCount?: number
  plugPlayBlocked?: boolean
}

type WaitItem = {
  id: string
  status: string
  quantity: number
  product: string
  accountType: string
  clientName: string
  clientEmail: string
  createdAt: string
}

type ContactLog = {
  id: string
  createdAt: string
  channel: string
  orderId: string | null
  clientName: string
  by: string
}

type Coupon = {
  id: string
  code: string
  percentOff: number
  minQuantity: number
  active: boolean
  description: string | null
}

function orderValue(o: GateOrder): number {
  const v = o.value
  if (typeof v === 'number') return v
  if (typeof v === 'string') return parseFloat(v) || 0
  if (v && typeof v === 'object' && 'toString' in v) return Number(v.toString())
  return 0
}

function waUrlForOrder(o: GateOrder): string {
  const raw = o.client.user.phone || ''
  const digits = raw.replace(/\D/g, '')
  const base = digits
    ? `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`
    : 'https://wa.me/'
  const app = getPublicAppBaseUrl()
  const msg = [
    `Olá! Tudo bem?`,
    `Sobre seu pedido: ${o.product} (${o.accountType}) — ${o.quantity} un.`,
    `Pedido #${o.id.slice(-8)} no Ads Ativos.`,
    app ? `Área do cliente: ${app}/dashboard/cliente` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return `${base}?text=${encodeURIComponent(msg)}`
}

function waUrlForClient(row: CrmRow): string {
  const raw = (row.phone || row.whatsapp || '').replace(/\D/g, '')
  const base = raw ? `https://wa.me/${raw.startsWith('55') ? raw : `55${raw}`}` : 'https://wa.me/'
  const msg = `Olá! Passando para alinhar próximas contas — Ads Ativos. (${row.name || row.email})`
  return `${base}?text=${encodeURIComponent(msg)}`
}

async function safeJson(r: Response) {
  const text = await r.text()
  if (!text.trim()) return { error: `HTTP ${r.status}: resposta vazia` }
  try { return JSON.parse(text) } catch { return { error: `HTTP ${r.status}: JSON inválido` } }
}

export function CommercialOxygenClient() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [gate, setGate] = useState<GateOrder[]>([])
  const [crm, setCrm] = useState<CrmRow[]>([])
  const [waitQueue, setWaitQueue] = useState<WaitItem[]>([])
  const [contactLogs, setContactLogs] = useState<ContactLog[]>([])
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const [couponCode, setCouponCode] = useState('')
  const [couponPct, setCouponPct] = useState(10)
  const [couponMinQty, setCouponMinQty] = useState(50)
  const [couponDesc, setCouponDesc] = useState('')
  const [creatingCoupon, setCreatingCoupon] = useState(false)

  const [payOrderId, setPayOrderId] = useState('')
  const [payDraft, setPayDraft] = useState<string | null>(null)
  const [payLoading, setPayLoading] = useState(false)

  const [crmInactiveDays, setCrmInactiveDays] = useState(0)
  const [crmMinSpent, setCrmMinSpent] = useState(0)
  const [crmSort, setCrmSort] = useState<'spent' | 'lastPurchase'>('spent')
  const [incentiveSummary, setIncentiveSummary] = useState<IncentiveSummary | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setErr(null)
    const crmQs = new URLSearchParams()
    if (crmInactiveDays > 0) crmQs.set('inactiveMinDays', String(crmInactiveDays))
    if (crmMinSpent > 0) crmQs.set('minSpent', String(crmMinSpent))
    crmQs.set('sort', crmSort)
    const crmUrl = `/api/commercial/crm${crmQs.toString() ? `?${crmQs}` : ''}`

    Promise.all([
      fetch('/api/commercial/stats').then(safeJson),
      fetch('/api/commercial/orders?tab=gatekeeper').then(safeJson),
      fetch(crmUrl).then(safeJson),
      fetch('/api/commercial/wait-queue').then(safeJson),
      fetch('/api/commercial/contact-logs').then(safeJson),
      fetch('/api/commercial/coupons').then(safeJson),
      fetch('/api/commercial/incentives/summary').then(safeJson),
    ])
      .then(([s, o, c, w, l, cp, inc]) => {
        if (s.error) throw new Error(s.error)
        if (typeof s.faturamento24h !== 'number' || typeof s.taxaConversaoPedido30d !== 'number') {
          throw new Error('Resposta de KPIs inválida')
        }
        setStats(s)
        if (o.error) throw new Error(o.error)
        setGate(o.orders || [])
        if (c.error) throw new Error(c.error)
        setCrm(c.clients || [])
        if (w.error) throw new Error(w.error)
        setWaitQueue(w.items || [])
        if (l.error) throw new Error(l.error)
        setContactLogs(l.logs || [])
        if (cp.error) throw new Error(cp.error)
        setCoupons(cp.coupons || [])
        if (!inc.error) setIncentiveSummary(inc)
      })
      .catch((e) => setErr(e.message || 'Erro ao carregar'))
      .finally(() => setLoading(false))
  }, [crmInactiveDays, crmMinSpent, crmSort])

  useEffect(() => {
    load()
  }, [load])

  async function logContact(clientId: string, orderId?: string) {
    await fetch('/api/commercial/contact-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, orderId: orderId || null }),
    }).catch(() => {})
  }

  function openWhatsAppOrder(o: GateOrder) {
    void logContact(o.client.id, o.id)
    window.open(waUrlForOrder(o), '_blank', 'noopener,noreferrer')
  }

  function openWhatsAppClient(row: CrmRow) {
    void logContact(row.id)
    window.open(waUrlForClient(row), '_blank', 'noopener,noreferrer')
  }

  async function confirmPayment(id: string) {
    if (!confirm('Confirmar pagamento manual? Libera produção (Francielle) e técnico (Gustavo).')) return
    const res = await fetch(`/api/commercial/orders/${id}/confirm`, { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert((d as { error?: string }).error || 'Erro')
      return
    }
    load()
  }

  async function cancelOrder(id: string) {
    if (!confirm('Cancelar este pedido?')) return
    const res = await fetch(`/api/commercial/orders/${id}/cancel`, { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert((d as { error?: string }).error || 'Erro')
      return
    }
    load()
  }

  async function saveNotes(clientId: string, currentNotes: string | null) {
    setSavingId(clientId)
    try {
      const text =
        notesDraft[clientId] !== undefined ? notesDraft[clientId] : (currentNotes ?? '')
      const res = await fetch(`/api/commercial/crm/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commercialNotes: text,
          lastContactDate: new Date().toISOString(),
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert((d as { error?: string }).error || 'Erro')
        return
      }
      load()
    } finally {
      setSavingId(null)
    }
  }

  async function createCoupon(e: React.FormEvent) {
    e.preventDefault()
    setCreatingCoupon(true)
    try {
      const res = await fetch('/api/commercial/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: couponCode.trim(),
          percentOff: couponPct,
          minQuantity: couponMinQty,
          description: couponDesc.trim() || undefined,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert((d as { error?: string }).error || 'Erro')
        return
      }
      setCouponCode('')
      setCouponDesc('')
      load()
    } finally {
      setCreatingCoupon(false)
    }
  }

  async function generatePaymentLink(e: React.FormEvent) {
    e.preventDefault()
    if (!payOrderId.trim()) return
    setPayLoading(true)
    setPayDraft(null)
    try {
      const res = await fetch('/api/commercial/payment-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: payOrderId.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert((d as { error?: string }).error || 'Erro')
        return
      }
      setPayDraft(
        [d.whatsappMessageDraft, d.note].filter(Boolean).join('\n\n---\n') || JSON.stringify(d, null, 2)
      )
    } finally {
      setPayLoading(false)
    }
  }

  if (loading && !stats) {
    return <p className="text-gray-500 py-8">Carregando Pulmão Comercial...</p>
  }
  if (err) {
    return (
      <p className="text-red-600 py-4">
        {err}{' '}
        <button type="button" className="underline" onClick={load}>
          Tentar novamente
        </button>
      </p>
    )
  }
  if (!stats) {
    return <p className="text-gray-500 py-4">Sem dados de KPIs.</p>
  }

  const repescagem = crm.filter((r) => r.alertRepescagem15d)
  const risco7d = crm.filter((r) => r.alertRisco7d)
  const fd = stats.faturamentoDiaCalendario ?? 0
  const pDay = stats.pedidosPagosDiaCalendario ?? stats.pedidosPagos24h
  const tDay =
    stats.ticketMedioDiaCalendario ??
    (pDay > 0 && fd > 0 ? fd / pDay : stats.ticketMedio24h)
  const pend = stats.pedidosPendentes ?? 0
  const forecast = stats.forecastFimMes ?? stats.faturamentoMes
  const diaAtual = stats.diaAtual ?? new Date().getDate()
  const diasNoMes =
    stats.diasNoMes ??
    new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const pctForecastVsMeta =
    stats.metaFaturamentoMensal > 0
      ? Math.min(100, Math.round((forecast / stats.metaFaturamentoMensal) * 100))
      : 0
  const linhas = stats.ticketMedioPorLinha ?? []
  const vendedores = stats.performanceVendedoresMes ?? []

  return (
    <div className="space-y-8">
      {stats.upsellAlerts.map((msg, i) => (
        <div
          key={i}
          className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-3 text-sm text-amber-900 dark:text-amber-100"
        >
          {msg}
        </div>
      ))}

      {stats.tintimTintim ? (
        <section className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20 p-4 space-y-3">
          <h2 className="text-lg font-semibold text-violet-900 dark:text-violet-100">
            Bridge Tintim → ERP
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Eventos recebidos (30d), leads UTM e vendas confirmadas via webhook. Origem do lead (Meta / Google /
            orgânico) fica em <code className="text-xs bg-white/50 dark:bg-black/20 px-1 rounded">leadAcquisitionSource</code> no perfil do cliente.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="rounded-lg bg-white dark:bg-gray-900/80 p-3 border border-gray-100 dark:border-white/10">
              <p className="text-xs text-gray-500">Payloads (auditoria)</p>
              <p className="text-xl font-bold">{stats.tintimTintim.webhookHits30d}</p>
            </div>
            <div className="rounded-lg bg-white dark:bg-gray-900/80 p-3 border border-gray-100 dark:border-white/10">
              <p className="text-xs text-gray-500">Leads TinTim (30d)</p>
              <p className="text-xl font-bold">{stats.tintimTintim.leadEvents30d}</p>
            </div>
            <div className="rounded-lg bg-white dark:bg-gray-900/80 p-3 border border-gray-100 dark:border-white/10">
              <p className="text-xs text-gray-500">Vendas pagas (30d)</p>
              <p className="text-xl font-bold">{stats.tintimTintim.salesPaid30d}</p>
            </div>
            <div className="rounded-lg bg-white dark:bg-gray-900/80 p-3 border border-gray-100 dark:border-white/10">
              <p className="text-xs text-gray-500">Conversão lead→venda</p>
              <p className="text-xl font-bold">
                {stats.tintimTintim.conversionLeadToSalePct != null
                  ? `${stats.tintimTintim.conversionLeadToSalePct}%`
                  : '—'}
              </p>
            </div>
          </div>
          {stats.tintimTintim.followUpPendente.length > 0 ? (
            <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50/80 dark:bg-rose-950/30 p-3">
              <p className="text-sm font-medium text-rose-900 dark:text-rose-100 mb-2">
                Pendente de follow-up (+24h sem login após compra Tintim)
              </p>
              <ul className="text-xs space-y-1 text-gray-700 dark:text-gray-300">
                {stats.tintimTintim.followUpPendente.map((f) => (
                  <li key={f.orderId}>
                    <span className="font-mono">{f.orderId.slice(0, 8)}</span> — {f.product} —{' '}
                    {f.clientName || f.clientEmail} — pago em{' '}
                    {new Date(f.paidAt).toLocaleString('pt-BR')}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-xs text-gray-500">
            Endpoint: <code className="break-all">POST /api/v1/webhooks/tintim</code> — ver variáveis{' '}
            <code>TINTIM_WEBHOOK_SECRET</code>, <code>TINTIM_PRODUCT_MAP_JSON</code>,{' '}
            <code>TINTIM_DELIVERY_RESPONSIBLE_USER_ID</code>.
          </p>
        </section>
      ) : null}

      {incentiveSummary && (
        <section className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-3">
          <h2 className="text-lg font-semibold text-emerald-900 dark:text-emerald-100">
            Engenharia de Incentivos (Comercial & Produção)
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="rounded-lg bg-white dark:bg-gray-900/80 p-3 border border-gray-100 dark:border-white/10">
              <p className="text-xs text-gray-500">Meta gatilho</p>
              <p className="text-xl font-bold">
                {incentiveSummary.targetBrl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            <div className="rounded-lg bg-white dark:bg-gray-900/80 p-3 border border-gray-100 dark:border-white/10">
              <p className="text-xs text-gray-500">Aprovado no mês</p>
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
                {incentiveSummary.totalApprovedBrl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            <div className="rounded-lg bg-white dark:bg-gray-900/80 p-3 border border-gray-100 dark:border-white/10">
              <p className="text-xs text-gray-500">Comissão vendedor</p>
              <p className="text-xl font-bold">{incentiveSummary.sellerCommissionPct}%</p>
            </div>
            <div className="rounded-lg bg-white dark:bg-gray-900/80 p-3 border border-gray-100 dark:border-white/10">
              <p className="text-xs text-gray-500">Override gerente</p>
              <p className="text-xl font-bold">{incentiveSummary.managerOverridePct}%</p>
            </div>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-300">
            {incentiveSummary.unlocked
              ? '✅ Meta comercial liberada: comissões ativas no mês atual.'
              : `⚠️ Faltam ${incentiveSummary.remainingToUnlockBrl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} para liberar comissão do vendedor.`}
            {' '}Bônus produção por unidade em estoque: {incentiveSummary.productionUnitBonusBrl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.
          </p>
          {incentiveSummary.topSellers && incentiveSummary.topSellers.length > 0 ? (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white/70 dark:bg-black/20 p-3">
              <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100 mb-2">
                Extrato rápido de comissão (mês atual)
              </p>
              <ul className="space-y-1 text-xs text-gray-700 dark:text-gray-300">
                {incentiveSummary.topSellers.map((s) => (
                  <li key={s.sellerId} className="flex flex-wrap justify-between gap-2">
                    <span>
                      <strong>{s.sellerName}</strong> — {s.approvedAmountBrl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      {s.unlocked ? '' : ' (meta ainda não liberada)'}
                    </span>
                    <span>
                      comissão: {s.sellerCommissionBrl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <Link href="/dashboard/commercial/incentivos" className="text-sm text-emerald-700 dark:text-emerald-300 underline">
              Ver extrato completo de comissões →
            </Link>
          </div>
        </section>
      )}

      <section>
        <h2 className="heading-2 mb-4">Dashboard de vendas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="card border-l-4 border-l-emerald-600 xl:col-span-2">
            <p className="text-xs text-gray-500 uppercase">Faturamento (últimas 24h)</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">
              {stats.faturamento24h.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-xs text-gray-500 mt-1">{stats.pedidosPagos24h} pedidos pagos</p>
          </div>
          <div className="card border-l-4 border-l-teal-500 xl:col-span-2">
            <p className="text-xs text-gray-500 uppercase">Faturamento hoje (dia civil)</p>
            <p className="text-2xl font-bold text-teal-800 dark:text-teal-300">
              {fd.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {pDay} pedidos · ticket médio{' '}
              {tDay.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
          <div className="card">
            <p className="text-xs text-gray-500 uppercase">Ticket médio (mês)</p>
            <p className="text-xl font-bold">
              {stats.ticketMedioMes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {stats.pedidosPagosMes ?? '—'} compras pagas no mês
            </p>
          </div>
          <div className="card border-l-4 border-l-amber-500">
            <p className="text-xs text-gray-500 uppercase">Pedidos pendentes</p>
            <p className="text-2xl font-bold text-amber-800 dark:text-amber-200">{pend}</p>
            <p className="text-xs text-gray-500 mt-1">Aguardando pagamento / gatekeeper</p>
          </div>
          <div className="card">
            <p className="text-xs text-gray-500 uppercase">Taxa de conversão</p>
            <p className="text-2xl font-bold text-primary-600">{stats.taxaConversaoPedido30d}%</p>
            <p className="text-xs text-gray-500 mt-1">Pagos / iniciados (30d)</p>
            {stats.taxaConversaoLeads30d != null && stats.leadsFunil30d > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                Leads → cliente: {stats.taxaConversaoLeads30d}% ({stats.leadsConvertidos30d ?? 0}/
                {stats.leadsFunil30d})
              </p>
            )}
          </div>
          <div className="card border-l-4 border-l-red-400">
            <p className="text-xs text-gray-500 uppercase">Churn (30d)</p>
            <p className="text-2xl font-bold text-red-700 dark:text-red-400">{stats.churnClientes30d}</p>
            <p className="text-xs text-gray-500 mt-1">Com histórico, sem compra há +30d</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <div className="card">
            <p className="text-xs text-gray-500 uppercase">Meta de faturamento (mês)</p>
            <p className="text-lg font-bold mt-1">
              {stats.faturamentoMes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}{' '}
              <span className="text-gray-500 font-normal text-sm">
                / {stats.metaFaturamentoMensal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </p>
            <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-primary-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, stats.progressMetaFaturamentoPct)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Unidades globais: {stats.metasGlobaisVendasUnidades.atual} /{' '}
              {stats.metasGlobaisVendasUnidades.meta} ({stats.metasGlobaisVendasUnidades.percentual}%)
            </p>
          </div>
          <div className="card">
            <p className="text-xs text-gray-500 uppercase">Forecast fim do mês</p>
            <p className="text-lg font-bold mt-1">
              {forecast.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Ritmo: dia {diaAtual} de {diasNoMes} · média diária × dias do mês (projeção simples).
            </p>
            <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-violet-500 rounded-full transition-all"
                style={{ width: `${pctForecastVsMeta}%` }}
                title="Projeção vs meta mensal"
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Barra: projeção em relação à meta ({pctForecastVsMeta}%).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <div className="card overflow-x-auto">
            <h3 className="font-semibold text-sm mb-2">Ticket médio por linha (mês)</h3>
            {linhas.length === 0 ? (
              <p className="text-gray-500 text-sm">Sem vendas pagas no mês por tipo de conta.</p>
            ) : (
              <table className="w-full text-sm min-w-[320px]">
                <thead>
                  <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                    <th className="pb-2">Tipo</th>
                    <th className="pb-2">Pedidos</th>
                    <th className="pb-2">Ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((r) => (
                    <tr key={r.accountType} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2">{r.accountType}</td>
                      <td className="py-2">{r.pedidos}</td>
                      <td className="py-2 font-medium">
                        {r.ticketMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="card overflow-x-auto">
            <h3 className="font-semibold text-sm mb-2">Performance de vendedores (mês)</h3>
            <p className="text-xs text-gray-500 mb-2">Base para comissão / bônus futuro.</p>
            {vendedores.length === 0 ? (
              <p className="text-gray-500 text-sm">Nenhuma venda com vendedor atribuído no mês.</p>
            ) : (
              <table className="w-full text-sm min-w-[280px]">
                <thead>
                  <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                    <th className="pb-2">Vendedor</th>
                    <th className="pb-2">Pedidos</th>
                    <th className="pb-2">Faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {vendedores.map((v) => (
                    <tr key={v.sellerId || v.nome} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2">{v.nome}</td>
                      <td className="py-2">{v.pedidos}</td>
                      <td className="py-2 font-medium">
                        {v.faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2 className="heading-2 mb-4">Links de venda rápida (PIX + WhatsApp)</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Crie links de checkout público para fechar no comercial com envio instantâneo de PIX no WhatsApp.
        </p>
        <div className="card">
          <VendaRapidaTab />
        </div>
      </section>

      <section>
        <h2 className="heading-2 mb-4">Gestão de leads e pedidos (Área do Cliente)</h2>
        <div className="card overflow-x-auto mb-4">
          <h3 className="font-semibold mb-2 text-sm">Solicitações e fila de espera</h3>
          {waitQueue.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhuma solicitação pendente.</p>
          ) : (
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                  <th className="pb-2">Cliente</th>
                  <th className="pb-2">Pedido</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Data</th>
                </tr>
              </thead>
              <tbody>
                {waitQueue.map((w) => (
                  <tr key={w.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2">{w.clientName}</td>
                    <td className="py-2">
                      {w.quantity}× {w.product} ({w.accountType})
                    </td>
                    <td className="py-2">{w.status}</td>
                    <td className="py-2 text-xs">{new Date(w.createdAt).toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-gray-500 mt-2">
            Origem: <strong>Solicitar</strong> na Área do Cliente e pedidos pagos com falta de contas.
          </p>
        </div>

        <div className="card overflow-x-auto mb-4">
          <h3 className="font-semibold mb-2 text-sm">Fila de aprovação (gatekeeper)</h3>
          {gate.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhum pedido aguardando pagamento.</p>
          ) : (
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                  <th className="pb-2 pr-2">Cliente</th>
                  <th className="pb-2 pr-2">Produto</th>
                  <th className="pb-2 pr-2">Valor</th>
                  <th className="pb-2 pr-2">Vendedor</th>
                  <th className="pb-2 pr-2">Status</th>
                  <th className="pb-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {gate.map((o) => (
                  <tr key={o.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2 pr-2">
                      <span className="font-medium">{o.client.user.name || o.client.user.email}</span>
                    </td>
                    <td className="py-2 pr-2">
                      {o.product} · {o.accountType} ×{o.quantity}
                    </td>
                    <td className="py-2 pr-2 font-medium">
                      {orderValue(o).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="py-2 pr-2">{o.seller?.name || '—'}</td>
                    <td className="py-2 pr-2">{o.status}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <div className="flex flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          className="btn-primary text-xs py-1 px-2"
                          onClick={() => confirmPayment(o.id)}
                        >
                          Confirmar pagamento
                        </button>
                        <button
                          type="button"
                          className="btn-secondary text-xs py-1 px-2"
                          onClick={() => openWhatsAppOrder(o)}
                        >
                          WhatsApp
                        </button>
                        <button type="button" className="text-xs text-red-600 px-2" onClick={() => cancelOrder(o.id)}>
                          Cancelar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card">
            <h3 className="font-semibold mb-3 text-sm">Cupons &amp; descontos</h3>
            <p className="text-xs text-gray-500 mb-3">
              Use o código na criação do pedido em Vendas (ex.: CLIENTE10 com mínimo 50 un.).
            </p>
            <form onSubmit={createCoupon} className="space-y-2 mb-4">
              <input
                className="input-field text-sm"
                placeholder="Código (ex: CLIENTE10)"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  className="input-field text-sm w-24"
                  min={1}
                  max={90}
                  value={couponPct}
                  onChange={(e) => setCouponPct(parseInt(e.target.value, 10) || 10)}
                />
                <span className="text-sm self-center">% off</span>
                <input
                  type="number"
                  className="input-field text-sm w-24"
                  min={1}
                  value={couponMinQty}
                  onChange={(e) => setCouponMinQty(parseInt(e.target.value, 10) || 1)}
                />
                <span className="text-sm self-center">mín. qtd</span>
              </div>
              <input
                className="input-field text-sm"
                placeholder="Descrição opcional"
                value={couponDesc}
                onChange={(e) => setCouponDesc(e.target.value)}
              />
              <button type="submit" className="btn-primary text-sm" disabled={creatingCoupon}>
                {creatingCoupon ? 'Criando...' : 'Criar cupom'}
              </button>
            </form>
            <ul className="text-sm space-y-1 max-h-40 overflow-y-auto">
              {coupons.map((c) => (
                <li key={c.id} className="flex justify-between gap-2 border-b border-gray-100 dark:border-gray-800 py-1">
                  <span className="font-mono">{c.code}</span>
                  <span>
                    {c.percentOff}% · mín. {c.minQuantity} · {c.active ? 'ativo' : 'inativo'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-3 text-sm">Link de pagamento rápido</h3>
            <p className="text-xs text-gray-500 mb-3">
              Rascunho de mensagem + PIX do pedido. Configure gateways no servidor (Asaas / MP / Stripe).
            </p>
            <form onSubmit={generatePaymentLink} className="space-y-2">
              <input
                className="input-field text-sm font-mono"
                placeholder="ID do pedido (cuid)"
                value={payOrderId}
                onChange={(e) => setPayOrderId(e.target.value)}
              />
              <button type="submit" className="btn-primary text-sm" disabled={payLoading}>
                {payLoading ? 'Gerando...' : 'Gerar rascunho'}
              </button>
            </form>
            {payDraft && (
              <textarea
                className="input-field text-xs w-full mt-3 min-h-[140px] font-mono"
                readOnly
                value={payDraft}
              />
            )}
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-3">
          Webhooks: <code>/api/webhooks/inter/pix</code> · <code>/api/webhooks/asaas/payment</code> · Telegram:{' '}
          <code>TELEGRAM_SALES_BOT_TOKEN</code> + <code>TELEGRAM_SALES_CHAT_ID</code> · Labels no Telegram:{' '}
          <code>COMMERCIAL_TELEGRAM_PRODUCER_LABEL</code>, <code>COMMERCIAL_TELEGRAM_TECH_LABEL</code>
        </p>
      </section>

      <section>
        <h2 className="heading-2 mb-4">Estoque pronto (sync produção)</h2>
        <div className="card space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Contas <strong>AVAILABLE</strong> que a produção tem prontas para venda (por plataforma e tipo).
          </p>
          <p className="text-2xl font-bold">{stats.inventory.totalAvailable}</p>
          <div className="flex flex-wrap gap-2">
            {stats.inventory.byPlatformType.map((r) => (
              <span key={`${r.platform}-${r.type}`} className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-sm">
                {r.label}
              </span>
            ))}
          </div>
          <Link href="/dashboard/estoque" className="text-primary-600 text-sm inline-block">
            Estoque completo →
          </Link>
        </div>
      </section>

      <section>
        <h2 className="heading-2 mb-4">Venda rápida (PIX + WhatsApp)</h2>
        <div className="card">
          <p className="text-xs text-gray-500 mb-3">
            Crie links comerciais de checkout rápido para fechar no WhatsApp com PIX e QR Code.
          </p>
          <VendaRapidaTab />
        </div>
      </section>

      <section>
        <h2 className="heading-2 mb-4">Alerta: clientes em risco (7 dias)</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Clientes com gasto acima do mínimo configurável e sem compra há pelo menos 7 dias — priorize contato antes do churn.
        </p>
        <div className="card">
          {risco7d.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhum cliente nesta janela (com os filtros atuais da carteira).</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {risco7d.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 dark:border-amber-900/50 py-2 text-amber-950 dark:text-amber-100"
                >
                  <span>
                    <strong>{r.name || r.email}</strong> — última compra:{' '}
                    {r.lastPurchaseAt ? new Date(r.lastPurchaseAt).toLocaleDateString('pt-BR') : '—'} ·{' '}
                    {r.totalSpent.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                  <button type="button" className="btn-secondary text-xs" onClick={() => openWhatsAppClient(r)}>
                    WhatsApp
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h2 className="heading-2 mb-4">CRM — repescagem 15 dias</h2>
        <div className="card">
          {repescagem.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhum cliente na janela de 15 dias.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {repescagem.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-red-100 dark:border-red-900/40 py-2 text-red-900 dark:text-red-200"
                >
                  <span>
                    <strong>{r.name || r.email}</strong> — última compra:{' '}
                    {r.lastPurchaseAt ? new Date(r.lastPurchaseAt).toLocaleDateString('pt-BR') : '—'}
                  </span>
                  <button type="button" className="btn-secondary text-xs" onClick={() => openWhatsAppClient(r)}>
                    Follow-up WhatsApp
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h2 className="heading-2 mb-4">Ranking de compradores (whale list)</h2>
        <div className="card mb-4 flex flex-wrap gap-4 items-end text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Última compra (inatividade mín.)</span>
            <select
              className="input-field text-sm min-w-[200px]"
              value={crmInactiveDays}
              onChange={(e) => setCrmInactiveDays(parseInt(e.target.value, 10) || 0)}
            >
              <option value={0}>Todos</option>
              <option value={7}>Sem compra há 7+ dias</option>
              <option value={15}>Sem compra há 15+ dias</option>
              <option value={30}>Sem compra há 30+ dias</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Gasto mínimo</span>
            <select
              className="input-field text-sm min-w-[160px]"
              value={crmMinSpent}
              onChange={(e) => setCrmMinSpent(parseFloat(e.target.value) || 0)}
            >
              <option value={0}>Qualquer</option>
              <option value={5000}>R$ 5.000+</option>
              <option value={50000}>R$ 50.000+</option>
              <option value={200000}>R$ 200.000+</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Ordenação</span>
            <select
              className="input-field text-sm min-w-[200px]"
              value={crmSort}
              onChange={(e) => setCrmSort(e.target.value as 'spent' | 'lastPurchase')}
            >
              <option value="spent">Maior investimento</option>
              <option value="lastPurchase">Última compra (mais antiga primeiro)</option>
            </select>
          </label>
          <p className="text-xs text-gray-500 basis-full">
            Filtros aplicam na API e atualizam esta tabela e os alertas de risco acima.
          </p>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                <th className="pb-2 pr-2">Nome</th>
                <th className="pb-2 pr-2">Total gasto</th>
                <th className="pb-2 pr-2">Última compra</th>
                <th className="pb-2 pr-2">Nível</th>
                <th className="pb-2 pr-2">Reputação</th>
                <th className="pb-2 pr-2">Notas</th>
              </tr>
            </thead>
            <tbody>
              {crm.map((row) => (
                <tr
                  key={row.id}
                  className={`border-b border-gray-100 dark:border-gray-800 ${
                    row.alertRisco7d
                      ? 'bg-amber-50/70 dark:bg-amber-950/25'
                      : row.alertRepescagem15d
                        ? 'bg-red-50/50 dark:bg-red-950/15'
                        : ''
                  }`}
                >
                  <td className="py-2 pr-2 align-top">
                    <span className="font-medium">{row.name || row.email}</span>
                    <span className="block text-xs text-gray-500">{row.email}</span>
                    <button type="button" className="text-xs text-primary-600 mt-1" onClick={() => openWhatsAppClient(row)}>
                      WhatsApp
                    </button>
                  </td>
                  <td className="py-2 pr-2 align-top font-medium">
                    {row.totalSpent.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="py-2 pr-2 align-top text-xs">
                    {row.lastPurchaseAt ? new Date(row.lastPurchaseAt).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="py-2 pr-2 align-top">
                    <span>
                      {row.whale === 'GOLD' ? '🥇 Gold' : row.whale === 'SILVER' ? '🥈 Silver' : '🥉 Bronze'}
                    </span>
                    {row.alertRisco7d && (
                      <span className="block text-xs text-amber-800 dark:text-amber-200 mt-1">
                        Sem compra 7d+ (prioridade)
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-2 align-top">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        (row.reputationScore ?? 50) >= 80
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : (row.reputationScore ?? 50) >= 50
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                      }`}
                    >
                      Score {row.reputationScore ?? 50}
                    </span>
                    <p className="text-[11px] text-gray-500 mt-1">
                      Nicho: {row.nicheTag || '—'} · LTV: {row.averageAccountLifetimeDays ?? '—'}d
                    </p>
                    {row.plugPlayBlocked && (
                      <p className="text-[11px] text-red-600 dark:text-red-300 mt-1">
                        Bloqueado para G2 Premium
                      </p>
                    )}
                  </td>
                  <td className="py-2 pr-2 align-top min-w-[200px]">
                    <textarea
                      className="input-field text-xs w-full min-h-[56px]"
                      placeholder="Preferências (ex: USD, spend alto)"
                      defaultValue={row.commercialNotes || ''}
                      onChange={(e) => setNotesDraft((d) => ({ ...d, [row.id]: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="btn-secondary text-xs mt-1"
                      disabled={savingId === row.id}
                      onClick={() => saveNotes(row.id, row.commercialNotes)}
                    >
                      {savingId === row.id ? 'Salvando...' : 'Salvar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="heading-2 mb-4">Log de WhatsApp</h2>
        <div className="card max-h-64 overflow-y-auto text-sm">
          {contactLogs.length === 0 ? (
            <p className="text-gray-500">Nenhum contato registrado. Use os botões WhatsApp acima.</p>
          ) : (
            <ul className="space-y-2">
              {contactLogs.map((log) => (
                <li key={log.id} className="border-b border-gray-100 dark:border-gray-800 pb-2">
                  <span className="text-gray-500">{new Date(log.createdAt).toLocaleString('pt-BR')}</span> —{' '}
                  <strong>{log.clientName}</strong> — {log.channel} por {log.by}
                  {log.orderId && <span className="text-xs text-gray-400"> · pedido {log.orderId.slice(-8)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
