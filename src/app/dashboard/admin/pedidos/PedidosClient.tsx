'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface OrderItem {
  id:            string
  orderNumber:   string | null
  status:        'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED'
  buyerName:     string
  buyerDoc:      string
  buyerWhatsapp: string
  buyerEmail:    string | null
  qty:           number
  totalAmount:   number
  product:       string
  productSlug:   string
  assetCategory: string
  pixCopyPaste:  string | null
  interTxid:     string | null
  interE2eId:    string | null
  expiresAt:     string | null
  paidAt:        string | null
  warrantyEndsAt: string | null
  deliverySent:  boolean
  utmifySent:    boolean
  seller:        { name: string | null; email: string } | null
  manager:       { name: string | null; email: string } | null
  utms: {
    source: string | null; medium: string | null; campaign: string | null
    content: string | null; term: string | null; src: string | null
    fbclid: string | null; gclid: string | null; referrer: string | null
  }
  reservedAssetIds: string[]
  createdAt:     string
}

interface Metrics {
  total:   number
  paid:    number
  pending: number
  expired: number
  revenue: number
}

interface PaginationInfo {
  page:  number
  limit: number
  total: number
  pages: number
}

interface Props { userRole: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; cls: string; dot: string }> = {
  PAID:      { label: 'Pago',      cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400' },
  PENDING:   { label: 'Pendente',  cls: 'bg-amber-500/15  text-amber-400   border-amber-500/30',   dot: 'bg-amber-400'   },
  EXPIRED:   { label: 'Expirado',  cls: 'bg-zinc-500/15   text-zinc-400    border-zinc-500/30',    dot: 'bg-zinc-400'    },
  CANCELLED: { label: 'Cancelado', cls: 'bg-red-500/15    text-red-400     border-red-500/30',     dot: 'bg-red-400'     },
}

function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}
function fmtDoc(d: string) {
  const clean = d.replace(/\D/g, '')
  if (clean.length === 11) return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (clean.length === 14) return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return d
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function fmtPhone(p: string) {
  const d = p.replace(/\D/g, '')
  return d.length >= 12 ? `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}` : p
}

// ─── Componente Linha de Pedido ────────────────────────────────────────────────

function OrderRow({ order, onCopy, isAdmin }: {
  order:   OrderItem
  onCopy:  (text: string) => void
  isAdmin: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const st = STATUS_LABELS[order.status] ?? STATUS_LABELS.EXPIRED
  const waLink = `https://wa.me/${order.buyerWhatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
    `Olá ${order.buyerName}! Seu pedido ${order.orderNumber ? '#' + order.orderNumber : ''} está aguardando pagamento. Produto: ${order.product} | Valor: ${fmtBRL(order.totalAmount)}`
  )}`

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Linha principal */}
      <div
        className="flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-800/40 transition"
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Nº Pedido */}
        <div className="min-w-[100px]">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Pedido</p>
          <p className="text-white font-mono font-semibold text-sm">
            {order.orderNumber ? `#${order.orderNumber}` : `#${order.id.slice(-6).toUpperCase()}`}
          </p>
        </div>

        {/* Status */}
        <div className="min-w-[100px]">
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${st.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
            {st.label}
          </span>
        </div>

        {/* Produto */}
        <div className="flex-1 min-w-[140px]">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Produto</p>
          <p className="text-white text-sm font-medium truncate">{order.product}</p>
          <p className="text-zinc-500 text-[10px]">{order.qty} unidade(s)</p>
        </div>

        {/* Comprador */}
        <div className="flex-1 min-w-[150px]">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Comprador</p>
          <p className="text-white text-sm font-medium truncate">{order.buyerName}</p>
          <p className="text-zinc-500 text-[10px]">{fmtDoc(order.buyerDoc)}</p>
        </div>

        {/* Valor */}
        <div className="min-w-[100px] text-right">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Valor</p>
          <p className="text-emerald-400 font-bold text-base">{fmtBRL(order.totalAmount)}</p>
        </div>

        {/* Data */}
        <div className="min-w-[110px] text-right">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Criado em</p>
          <p className="text-zinc-300 text-xs">{fmtDate(order.createdAt)}</p>
          {order.paidAt && (
            <p className="text-emerald-400 text-[10px]">Pago: {fmtDate(order.paidAt)}</p>
          )}
        </div>

        {/* Expand */}
        <span className="text-zinc-500 text-sm ml-auto">{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Detalhes expandidos */}
      {expanded && (
        <div className="border-t border-zinc-800 px-4 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Contato */}
            <div className="bg-zinc-800/50 rounded-xl p-3 space-y-1.5">
              <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Contato</p>
              <div className="flex items-center justify-between">
                <span className="text-zinc-300 text-xs">{fmtPhone(order.buyerWhatsapp)}</span>
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] bg-green-600 hover:bg-green-500 text-white px-2 py-0.5 rounded-md transition"
                  onClick={(e) => e.stopPropagation()}
                >
                  WhatsApp
                </a>
              </div>
              {order.buyerEmail && (
                <p className="text-zinc-400 text-xs truncate">{order.buyerEmail}</p>
              )}
            </div>

            {/* Pagamento */}
            <div className="bg-zinc-800/50 rounded-xl p-3 space-y-1.5">
              <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Pagamento PIX</p>
              {order.interTxid && (
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 text-[10px] font-mono truncate max-w-[140px]">{order.interTxid}</span>
                  <button
                    className="text-[10px] bg-zinc-700 hover:bg-zinc-600 text-white px-2 py-0.5 rounded-md transition"
                    onClick={(e) => { e.stopPropagation(); onCopy(order.interTxid!) }}
                  >Copiar TxID</button>
                </div>
              )}
              {order.pixCopyPaste && (
                <button
                  className="w-full text-[10px] bg-emerald-700 hover:bg-emerald-600 text-white px-2 py-1 rounded-md transition"
                  onClick={(e) => { e.stopPropagation(); onCopy(order.pixCopyPaste!) }}
                >
                  Copiar PIX Copia-e-Cola
                </button>
              )}
              {order.expiresAt && order.status === 'PENDING' && (
                <p className="text-amber-400 text-[10px]">Expira: {fmtDate(order.expiresAt)}</p>
              )}
              {order.warrantyEndsAt && (
                <p className="text-zinc-400 text-[10px]">Garantia até: {fmtDate(order.warrantyEndsAt)}</p>
              )}
            </div>

            {/* Entrega */}
            <div className="bg-zinc-800/50 rounded-xl p-3 space-y-1.5">
              <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Entrega & Rastreio</p>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${order.deliverySent ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                <span className="text-xs text-zinc-300">{order.deliverySent ? 'Entrega enviada' : 'Entrega pendente'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${order.utmifySent ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                <span className="text-xs text-zinc-300">{order.utmifySent ? 'Utmify sincronizado' : 'Utmify pendente'}</span>
              </div>
              {order.reservedAssetIds && Array.isArray(order.reservedAssetIds) && order.reservedAssetIds.length > 0 && (
                <p className="text-zinc-500 text-[10px]">{order.reservedAssetIds.length} ativo(s) reservado(s)</p>
              )}
            </div>

            {/* UTMs */}
            {(order.utms.source || order.utms.campaign || order.utms.fbclid || order.utms.gclid) && (
              <div className="bg-zinc-800/50 rounded-xl p-3 space-y-1 sm:col-span-2">
                <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Atribuição / UTMs</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {order.utms.source   && <p className="text-[10px] text-zinc-300"><span className="text-zinc-500">Source:</span> {order.utms.source}</p>}
                  {order.utms.medium   && <p className="text-[10px] text-zinc-300"><span className="text-zinc-500">Medium:</span> {order.utms.medium}</p>}
                  {order.utms.campaign && <p className="text-[10px] text-zinc-300"><span className="text-zinc-500">Campaign:</span> {order.utms.campaign}</p>}
                  {order.utms.content  && <p className="text-[10px] text-zinc-300"><span className="text-zinc-500">Content:</span> {order.utms.content}</p>}
                  {order.utms.fbclid   && <p className="text-[10px] text-zinc-300"><span className="text-zinc-500">fbclid:</span> {order.utms.fbclid.slice(0, 20)}…</p>}
                  {order.utms.gclid    && <p className="text-[10px] text-zinc-300"><span className="text-zinc-500">gclid:</span> {order.utms.gclid.slice(0, 20)}…</p>}
                  {order.utms.referrer && <p className="text-[10px] text-zinc-300 col-span-2 truncate"><span className="text-zinc-500">Referrer:</span> {order.utms.referrer}</p>}
                </div>
              </div>
            )}

            {/* Vendedor / Gerente — só ADMIN vê */}
            {isAdmin && (order.seller || order.manager) && (
              <div className="bg-zinc-800/50 rounded-xl p-3 space-y-1.5">
                <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Equipe</p>
                {order.seller  && <p className="text-xs text-zinc-300">👤 Vendedor: <span className="text-white">{order.seller.name  || order.seller.email}</span></p>}
                {order.manager && <p className="text-xs text-zinc-300">🏆 Gerente: <span className="text-white">{order.manager.name || order.manager.email}</span></p>}
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export function PedidosClient({ userRole }: Props) {
  const isAdmin = userRole === 'ADMIN'

  const [metrics, setMetrics]   = useState<Metrics | null>(null)
  const [items,   setItems]     = useState<OrderItem[]>([])
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 50, total: 0, pages: 0 })
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState<string>('')   // '' = all statuses
  const [search,   setSearch]   = useState<string>('')
  const [searchInput, setSearchInput] = useState<string>('')
  const [page,     setPage]     = useState(1)
  const [copied,   setCopied]   = useState('')
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        page:   String(page),
        limit:  '50',
        ...(filter ? { status: filter } : {}),
        ...(search ? { search }         : {}),
      })
      const r    = await fetch(`/api/admin/pedidos?${qs}`)
      const data = await r.json()
      setMetrics(data.metrics)
      setItems(data.items)
      setPagination(data.pagination)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [filter, search, page])

  useEffect(() => { load() }, [load])

  const handleSearch = (val: string) => {
    setSearchInput(val)
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(() => { setSearch(val); setPage(1) }, 400)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(text.slice(0, 20))
    setTimeout(() => setCopied(''), 2500)
  }

  // ── KPI cards ──────────────────────────────────────────────────────────────
  const kpis = metrics ? [
    { label: 'Total de Pedidos',   value: metrics.total,            color: 'text-white',       bg: 'bg-zinc-800' },
    { label: 'Pagos',              value: metrics.paid,             color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Pendentes',          value: metrics.pending,          color: 'text-amber-400',   bg: 'bg-amber-500/10'   },
    { label: 'Expirados',          value: metrics.expired,          color: 'text-zinc-400',    bg: 'bg-zinc-700/30'    },
    { label: 'Receita (Pagos)',    value: fmtBRL(metrics.revenue),  color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  ] : []

  return (
    <div className="space-y-6 p-4 md:p-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            🧾 Pedidos
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Todos os pedidos gerados via checkout PIX — em tempo real.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded-xl border border-zinc-700 transition"
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
          ) : '↻'} Atualizar
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className={`${k.bg} border border-zinc-800 rounded-xl p-4 space-y-1`}>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{k.label}</p>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Status */}
        <div className="flex gap-1.5 flex-wrap">
          {[
            { v: '',          l: 'Todos'     },
            { v: 'PAID',      l: '✅ Pagos'   },
            { v: 'PENDING',   l: '⏳ Pendentes'},
            { v: 'EXPIRED',   l: '⏸ Expirados'},
          ].map(({ v, l }) => (
            <button
              key={v}
              onClick={() => { setFilter(v); setPage(1) }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                filter === v
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Busca */}
        <input
          type="text"
          placeholder="Buscar por nome, CPF/CNPJ, número do pedido..."
          value={searchInput}
          onChange={(e) => handleSearch(e.target.value)}
          className="flex-1 min-w-[220px] bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition"
        />
      </div>

      {/* Clipboard toast */}
      {copied && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-emerald-700 text-white text-xs px-4 py-2 rounded-xl shadow-lg z-50">
          ✅ Copiado: {copied}...
        </div>
      )}

      {/* Lista de pedidos */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <p className="text-4xl mb-3">🧾</p>
          <p className="font-medium">Nenhum pedido encontrado</p>
          <p className="text-xs mt-1">Ajuste os filtros ou aguarde novos pedidos.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              onCopy={copyToClipboard}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      {/* Paginação */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-4 py-2 bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl disabled:opacity-40 hover:bg-zinc-700 transition"
          >
            ← Anterior
          </button>
          <span className="text-zinc-400 text-sm">
            Pág. {pagination.page} / {pagination.pages} ({pagination.total} pedidos)
          </span>
          <button
            disabled={page >= pagination.pages}
            onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
            className="px-4 py-2 bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl disabled:opacity-40 hover:bg-zinc-700 transition"
          >
            Próxima →
          </button>
        </div>
      )}
    </div>
  )
}
