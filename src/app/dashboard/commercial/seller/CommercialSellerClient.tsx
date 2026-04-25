'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Copy, MessageCircle, QrCode, RefreshCcw, Search, ShoppingCart, ShieldAlert } from 'lucide-react'

type StockListing = {
  id: string
  slug: string
  title: string
  subtitle: string | null
  badge: string | null
  assetCategory: string
  pricePerUnit: number
  maxQty: number
  active: boolean
  available: number
  blockedByStopLoss: number
  stopLossWarning: boolean
  previewAssets: Array<{
    adsId: string
    displayName: string
    salePrice: number
    authorityTag: string | null
    year: number | null
  }>
}

type StockResponse = {
  totals: {
    totalListings: number
    activeListings: number
    totalAvailable: number
  }
  items: StockListing[]
}

type CheckoutRow = {
  id: string
  orderNumber?: string | null
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED'
  buyerName: string
  buyerWhatsapp: string
  qty: number
  totalAmount: number
  pixCopyPaste: string | null
  createdAt: string
  paidAt: string | null
  expiresAt: string | null
  listing: {
    title: string
    slug: string
  }
  checkoutUrl: string
}

type CheckoutResponse = {
  items: CheckoutRow[]
}

type GeneratedCheckout = {
  checkoutId: string
  orderNumber?: string | null
  txid: string
  pixCopyPaste: string
  qrCodeBase64: string
  expiresAt: string
  totalAmount: number
  qty: number
  title: string
  resumeUrl: string
  slug: string
  buyerName: string
  buyerWhatsapp: string
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED'
  paidAt: string | null
}

function normalizeWhatsapp(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('55')) return `+${digits}`
  return `+55${digits}`
}

function statusChip(status: string): string {
  if (status === 'PAID') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
  if (status === 'PENDING') return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
  if (status === 'EXPIRED') return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
  return 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
}

export function CommercialSellerClient({
  sellerId,
  sellerName,
}: {
  sellerId: string
  sellerName: string
}) {
  const [stock, setStock] = useState<StockResponse | null>(null)
  const [history, setHistory] = useState<CheckoutRow[]>([])
  const [loadingStock, setLoadingStock] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [query, setQuery] = useState('')
  const [onlyActive, setOnlyActive] = useState(true)
  const [historyStatus, setHistoryStatus] = useState<'ALL' | 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED'>('ALL')
  const [historySearch, setHistorySearch] = useState('')

  const [selectedListing, setSelectedListing] = useState<StockListing | null>(null)
  const [buyerName, setBuyerName] = useState('')
  const [buyerCpf, setBuyerCpf] = useState('')
  const [buyerWhatsapp, setBuyerWhatsapp] = useState('')
  const [buyerEmail, setBuyerEmail] = useState('')
  const [qty, setQty] = useState(1)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [generated, setGenerated] = useState<GeneratedCheckout | null>(null)
  const [copiedPix, setCopiedPix] = useState(false)
  const normalizedHistorySearch = historySearch.trim().toLowerCase()

  // Link personalizado por listing
  const [linkPanel, setLinkPanel]   = useState<string | null>(null) // listingId aberto
  const [copiedLink, setCopiedLink] = useState<string | null>(null) // listingId cujo link foi copiado

  const loadStock = useCallback(async () => {
    setLoadingStock(true)
    try {
      const res = await fetch('/api/commercial/seller/stock')
      const data = (await res.json()) as StockResponse | { error?: string }
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Erro ao carregar estoque')
      setStock(data as StockResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar estoque')
    } finally {
      setLoadingStock(false)
    }
  }, [])

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const params = new URLSearchParams()
      if (historyStatus !== 'ALL') params.set('status', historyStatus)
      if (historySearch.trim()) params.set('search', historySearch.trim())
      const suffix = params.size > 0 ? `?${params.toString()}` : ''
      const res = await fetch(`/api/commercial/seller/checkouts${suffix}`)
      const data = (await res.json()) as CheckoutResponse | { error?: string }
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Erro ao carregar histórico')
      setHistory((data as CheckoutResponse).items ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar histórico')
    } finally {
      setLoadingHistory(false)
    }
  }, [historyStatus, historySearch])

  useEffect(() => {
    loadStock()
    loadHistory()
  }, [loadStock, loadHistory])

  useEffect(() => {
    if (!generated || generated.status === 'PAID' || generated.status === 'EXPIRED' || generated.status === 'CANCELLED') {
      return
    }
    const timer = window.setInterval(async () => {
      const res = await fetch(
        `/api/loja/${generated.slug}?checkoutId=${encodeURIComponent(generated.checkoutId)}`,
        { cache: 'no-store' }
      )
      if (!res.ok) return
      const data = (await res.json()) as { status?: GeneratedCheckout['status']; paidAt?: string | null }
      if (!data?.status) return
      setGenerated((prev) =>
        prev
          ? {
              ...prev,
              status: data.status || prev.status,
              paidAt: data.paidAt ?? prev.paidAt,
            }
          : prev
      )
      if (data.status === 'PAID') {
        loadHistory()
      }
    }, 7000)
    return () => window.clearInterval(timer)
  }, [generated, loadHistory])

  const filteredStock = useMemo(() => {
    const list = stock?.items ?? []
    const q = query.trim().toLowerCase()
    return list.filter((item) => {
      if (onlyActive && !item.active) return false
      if (!q) return true
      return (
        item.title.toLowerCase().includes(q) ||
        item.slug.toLowerCase().includes(q) ||
        item.assetCategory.toLowerCase().includes(q)
      )
    })
  }, [stock, query, onlyActive])

  async function createPixCheckout(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedListing) return
    const finalWhatsapp = normalizeWhatsapp(buyerWhatsapp)
    setCreating(true)
    setError(null)
    try {
      const finalQty = Math.max(1, Math.min(qty, selectedListing.maxQty, selectedListing.available))
      const res = await fetch(`/api/loja/${selectedListing.slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: buyerName.trim(),
          cpf: buyerCpf.trim(),
          whatsapp: finalWhatsapp,
          email: buyerEmail.trim() || undefined,
          qty: finalQty,
        }),
      })
      const data = (await res.json()) as
        | {
            error?: string
            checkoutId: string
            txid: string
            pixCopyPaste: string
            qrCodeBase64: string
            expiresAt: string
            totalAmount: number
            qty: number
            title: string
            resumeUrl: string
          }
        | { error?: string }
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || 'Falha ao gerar PIX')
      }
      setGenerated({
        checkoutId: (data as GeneratedCheckout).checkoutId,
        orderNumber: (data as { orderNumber?: string | null }).orderNumber ?? null,
        txid: (data as GeneratedCheckout).txid,
        pixCopyPaste: (data as GeneratedCheckout).pixCopyPaste,
        qrCodeBase64: (data as GeneratedCheckout).qrCodeBase64,
        expiresAt: (data as GeneratedCheckout).expiresAt,
        totalAmount: (data as GeneratedCheckout).totalAmount,
        qty: (data as GeneratedCheckout).qty,
        title: (data as GeneratedCheckout).title,
        resumeUrl: (data as GeneratedCheckout).resumeUrl,
        slug: selectedListing.slug,
        buyerName: buyerName.trim(),
        buyerWhatsapp: finalWhatsapp,
        status: 'PENDING',
        paidAt: null,
      })
      setCopiedPix(false)
      await Promise.all([loadStock(), loadHistory()])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro inesperado ao gerar PIX')
    } finally {
      setCreating(false)
    }
  }

  async function copyPixCode() {
    if (!generated?.pixCopyPaste) return
    await navigator.clipboard.writeText(generated.pixCopyPaste)
    setCopiedPix(true)
    window.setTimeout(() => setCopiedPix(false), 2200)
  }

  function openBuyerWhatsapp() {
    if (!generated) return
    const phone = generated.buyerWhatsapp.replace(/\D/g, '')
    if (!phone) return
    const message = [
      '🚀 PIX gerado na Ads Ativos',
      '',
      `Pedido: ${generated.orderNumber ?? generated.checkoutId}`,
      `Produto: ${generated.title}`,
      `Quantidade: ${generated.qty}`,
      `Valor: R$ ${generated.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      '',
      'PIX copia e cola:',
      generated.pixCopyPaste,
      '',
      `QR e acompanhamento: ${generated.resumeUrl}`,
    ].join('\n')
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  }

  function getPersonalizedLink(listing: StockListing): string {
    const base   = typeof window !== 'undefined' ? window.location.origin : ''
    const utmName = encodeURIComponent(sellerName.toLowerCase().replace(/\s+/g, '_').slice(0, 30))
    const utmCampaign = encodeURIComponent(listing.slug.slice(0, 50))
    const params = new URLSearchParams({
      ref:          sellerId,
      utm_source:   utmName,
      utm_medium:   'whatsapp',
      utm_campaign: utmCampaign,
    })
    return `${base}/loja/${listing.slug}?${params.toString()}`
  }

  async function copyLink(listing: StockListing) {
    const url = getPersonalizedLink(listing)
    await navigator.clipboard.writeText(url)
    setCopiedLink(listing.id)
    window.setTimeout(() => setCopiedLink(null), 2500)
  }

  function sendLinkWhatsapp(listing: StockListing) {
    const url     = getPersonalizedLink(listing)
    const message = [
      `🛡️ *Ads Ativos — ${listing.title}*`,
      '',
      `Compra 100% segura via PIX com entrega automática.`,
      '',
      `⚡ *${listing.available} unidade${listing.available !== 1 ? 's' : ''} disponível${listing.available !== 1 ? 'is' : ''}*`,
      `💰 R$ ${listing.pricePerUnit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} por unidade`,
      '',
      `👉 Pague agora via PIX:`,
      url,
    ].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  }

  const pendingCount = history.filter((h) => h.status === 'PENDING').length
  const paidCount = history.filter((h) => h.status === 'PAID').length
  const hasClientSideSearch = normalizedHistorySearch.length > 0
  const visibleHistory = hasClientSideSearch
    ? history.filter((item) => {
        const haystack = [
          item.orderNumber ?? '',
          item.id,
          item.buyerName,
          item.buyerWhatsapp,
          item.listing.title,
          item.listing.slug,
        ].join(' ').toLowerCase()
        return haystack.includes(normalizedHistorySearch)
      })
    : history

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>
      ) : null}

      {/* Painel de comissão do mês */}
      <SellerCommissionPanel sellerId={sellerId} />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card">
          <p className="text-xs text-gray-500 uppercase">Listings ativos</p>
          <p className="text-2xl font-bold">{stock?.totals.activeListings ?? '—'}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 uppercase">Estoque disponível</p>
          <p className="text-2xl font-bold">{stock?.totals.totalAvailable ?? '—'}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 uppercase">PIX pendentes</p>
          <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 uppercase">Vendas aprovadas</p>
          <p className="text-2xl font-bold text-emerald-600">{paidCount}</p>
        </div>
      </section>

      <section id="estoque" className="card space-y-4">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div>
            <h2 className="heading-2">Menu rápido de estoque</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Consulte disponibilidade, escolha o ativo e lance a venda em segundos.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => loadStock()}>
              <RefreshCcw className="w-4 h-4 mr-1 inline" />
              Atualizar estoque
            </button>
            <button type="button" className="btn-primary text-sm" onClick={() => loadHistory()}>
              Atualizar vendas
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="input-field flex items-center gap-2 w-full md:w-[320px]">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título, slug ou categoria"
              className="bg-transparent outline-none w-full"
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded border border-gray-200 dark:border-white/10">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.target.checked)}
            />
            Mostrar somente ativos
          </label>
        </div>

        {loadingStock ? (
          <p className="text-sm text-gray-500">Carregando estoque...</p>
        ) : filteredStock.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum listing encontrado com os filtros atuais.</p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {filteredStock.map((item) => (
              <div key={item.id} className="rounded-xl border border-gray-200 dark:border-white/10 p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="text-xs text-gray-500">
                      {item.assetCategory.replaceAll('_', ' ')} · até {item.maxQty} un.
                    </p>
                    {item.subtitle ? <p className="text-xs text-gray-500 mt-1">{item.subtitle}</p> : null}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary-600">
                      R$ {item.pricePerUnit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs ${
                        item.active
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
                      }`}
                    >
                      {item.active ? 'Ativo' : 'Pausado'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span>
                    <span className="font-medium">Disponível agora:</span>{' '}
                    <span className={item.available > 0 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>
                      {item.available}
                    </span>
                  </span>
                  {item.stopLossWarning && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-300 dark:border-red-800">
                      <AlertTriangle className="w-3 h-3" />
                      {item.blockedByStopLoss} bloqueado{item.blockedByStopLoss !== 1 ? 's' : ''} · Stop-Loss
                    </span>
                  )}
                </div>

                {item.previewAssets.length > 0 ? (
                  <div className="rounded-lg bg-gray-50 dark:bg-white/5 p-2">
                    <p className="text-xs text-gray-500 mb-1">Prévia de IDs em estoque</p>
                    <ul className="space-y-1">
                      {item.previewAssets.map((asset) => (
                        <li key={`${item.id}-${asset.adsId}`} className="text-xs flex justify-between gap-2">
                          <span className="font-mono">{asset.adsId}</span>
                          <span className="text-gray-500 truncate">{asset.authorityTag || asset.displayName}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary text-sm"
                    disabled={!item.active || item.available === 0}
                    onClick={() => {
                      setSelectedListing(item)
                      setQty(Math.min(1, Math.max(1, item.available)))
                    }}
                  >
                    <ShoppingCart className="w-4 h-4 mr-1 inline" />
                    Lançar venda PIX
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-sm"
                    onClick={() => setLinkPanel(linkPanel === item.id ? null : item.id)}
                  >
                    🔗 Link personalizado
                  </button>
                  <Link href={`/loja/${item.slug}`} target="_blank" className="btn-secondary text-sm">
                    Abrir página pública
                  </Link>
                </div>

                {/* Painel de link personalizado */}
                {linkPanel === item.id && (
                  <div className="rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50/30 dark:bg-primary-950/20 p-3 space-y-2">
                    <p className="text-xs font-semibold text-primary-700 dark:text-primary-300 uppercase tracking-wider">
                      🔗 Seu link de vendedor
                    </p>
                    <div className="flex items-center gap-2 bg-white dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2">
                      <span className="text-xs font-mono text-gray-600 dark:text-gray-300 truncate flex-1 select-all">
                        {getPersonalizedLink(item)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => copyLink(item)}
                        className="btn-secondary text-xs"
                      >
                        <Copy className="w-3.5 h-3.5 mr-1 inline" />
                        {copiedLink === item.id ? 'Copiado! ✅' : 'Copiar link'}
                      </button>
                      <button
                        type="button"
                        onClick={() => sendLinkWhatsapp(item)}
                        className="btn-primary text-xs"
                      >
                        <MessageCircle className="w-3.5 h-3.5 mr-1 inline" />
                        Enviar no WhatsApp
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-600">
                      Vendas feitas por esse link são atribuídas a você automaticamente, com rastreamento UTM para Utmify.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section id="gerar" className="card space-y-3">
        <div>
          <h2 className="heading-2">Fechamento de venda (PIX + QR Code)</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Fluxo igual ao catálogo: preenche os dados do cliente, gera PIX e envia no WhatsApp.
          </p>
        </div>

        {!selectedListing ? (
          <p className="text-sm text-gray-500">
            Selecione um listing no menu de estoque para iniciar a venda.
          </p>
        ) : (
          <form className="space-y-3" onSubmit={createPixCheckout}>
            <div className="rounded-lg border border-primary-200 dark:border-primary-800 px-3 py-2 text-sm">
              <p className="font-semibold">{selectedListing.title}</p>
              <p className="text-gray-600 dark:text-gray-400">
                R$ {selectedListing.pricePerUnit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} por unidade ·
                disponível {selectedListing.available}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                className="input-field"
                placeholder="Nome completo do cliente"
                required
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
              />
              <input
                className="input-field"
                placeholder="CPF (somente números ou com máscara)"
                required
                value={buyerCpf}
                onChange={(e) => setBuyerCpf(e.target.value)}
              />
              <input
                className="input-field"
                placeholder="WhatsApp (ex: 11999999999)"
                required
                value={buyerWhatsapp}
                onChange={(e) => setBuyerWhatsapp(e.target.value)}
              />
              <input
                className="input-field"
                placeholder="Email (opcional)"
                value={buyerEmail}
                onChange={(e) => setBuyerEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-gray-600 dark:text-gray-400">Quantidade:</label>
              <input
                type="number"
                min={1}
                max={Math.max(1, Math.min(selectedListing.maxQty, selectedListing.available))}
                className="input-field w-24"
                value={qty}
                onChange={(e) => setQty(Number(e.target.value) || 1)}
              />
              <span className="text-sm text-gray-500">
                Total previsto:{' '}
                {(
                  selectedListing.pricePerUnit *
                  Math.max(1, Math.min(qty, selectedListing.maxQty, selectedListing.available))
                ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn-primary" disabled={creating}>
                {creating ? 'Gerando PIX...' : 'Gerar PIX agora'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setSelectedListing(null)}>
                Trocar ativo
              </button>
            </div>
          </form>
        )}

        {generated ? (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 p-4 space-y-3 bg-emerald-50/40 dark:bg-emerald-950/20">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">PIX gerado para {generated.buyerName}</h3>
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusChip(generated.status)}`}>
                {generated.status}
              </span>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Pedido {generated.orderNumber ?? generated.checkoutId} · {generated.title} · {generated.qty} un. ·{' '}
              {generated.totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <div className="rounded-lg bg-white dark:bg-black/20 border border-emerald-100 dark:border-emerald-900 p-3">
              <p className="text-xs text-gray-500 mb-1">PIX copia e cola</p>
              <p className="font-mono text-xs break-all">{generated.pixCopyPaste}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copyPixCode} className="btn-secondary text-sm">
                <Copy className="w-4 h-4 mr-1 inline" />
                {copiedPix ? 'PIX copiado!' : 'Copiar PIX'}
              </button>
              <button type="button" onClick={openBuyerWhatsapp} className="btn-primary text-sm">
                <MessageCircle className="w-4 h-4 mr-1 inline" />
                Enviar no WhatsApp
              </button>
              <Link href={generated.resumeUrl} target="_blank" className="btn-secondary text-sm">
                <QrCode className="w-4 h-4 mr-1 inline" />
                Abrir QR / status
              </Link>
            </div>
            <p className="text-xs text-gray-500">
              Expira em: {new Date(generated.expiresAt).toLocaleString('pt-BR')}
              {generated.paidAt ? ` · Pago em ${new Date(generated.paidAt).toLocaleString('pt-BR')}` : ''}
            </p>
          </div>
        ) : null}
      </section>

      <section id="historico" className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="heading-2">Histórico rápido de vendas PIX</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Checkouts gerados por você com status em tempo real.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="input-field flex items-center gap-2 text-sm w-[320px]">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Buscar pedido VR, cliente, telefone, produto..."
                className="bg-transparent outline-none w-full"
              />
            </label>
            <select
              className="input-field text-sm w-[180px]"
              value={historyStatus}
              onChange={(e) =>
                setHistoryStatus(e.target.value as 'ALL' | 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED')
              }
            >
              <option value="ALL">Todos os status</option>
              <option value="PENDING">Pendentes</option>
              <option value="PAID">Pagos</option>
              <option value="EXPIRED">Expirados</option>
              <option value="CANCELLED">Cancelados</option>
            </select>
          </div>
        </div>

        {loadingHistory ? (
          <p className="text-sm text-gray-500">Carregando histórico...</p>
        ) : visibleHistory.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum checkout encontrado para o filtro selecionado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-left border-b border-gray-200 dark:border-white/10 text-gray-500">
                  <th className="pb-2 pr-2">Pedido</th>
                  <th className="pb-2 pr-2">Cliente</th>
                  <th className="pb-2 pr-2">Produto</th>
                  <th className="pb-2 pr-2">Valor</th>
                  <th className="pb-2 pr-2">Status</th>
                  <th className="pb-2 pr-2">Criado em</th>
                  <th className="pb-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visibleHistory.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 dark:border-white/5">
                    <td className="py-2 pr-2">
                      <p className="font-mono text-xs">{item.orderNumber ?? item.id.slice(0, 8)}</p>
                      <p className="text-[10px] text-gray-500">ref: {item.id.slice(0, 8)}</p>
                    </td>
                    <td className="py-2 pr-2">{item.buyerName}</td>
                    <td className="py-2 pr-2">
                      {item.listing.title} · {item.qty} un.
                    </td>
                    <td className="py-2 pr-2">
                      {item.totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="py-2 pr-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${statusChip(item.status)}`}>{item.status}</span>
                    </td>
                    <td className="py-2 pr-2 text-xs">{new Date(item.createdAt).toLocaleString('pt-BR')}</td>
                    <td className="py-2 text-right">
                      <Link href={item.checkoutUrl} target="_blank" className="text-primary-600 text-xs hover:underline">
                        Abrir checkout
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Registrar Queda de Ativo ─────────────────────────────────────── */}
      <RegistrarQuedaPanel />
    </div>
  )
}

// ─── Painel de Comissão do Vendedor ──────────────────────────────────────────

type CommissionSummary = {
  totalVendidoBrl: number
  metaBatida: boolean
  comissaoPagarBrl: number
  comissaoEstimadaBrl: number
  progressPct: number
  sellerGoalBrl: number
  sellerCommissionPct: number
  month: number
  year: number
}

function SellerCommissionPanel({ sellerId }: { sellerId: string }) {
  const [data, setData] = useState<CommissionSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const now = new Date()
    fetch(`/api/commercial/incentives/summary?month=${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        if (!json) return
        // Encontra o resumo do próprio vendedor
        const self = json.sellers?.find((s: { sellerId: string }) => s.sellerId === sellerId) ?? null
        if (!self) {
          // Se não é vendedor em equipe, usa os dados da própria sessão
          const totalVendido = json.totalVendidoBrl ?? json.summarySelf?.totalGrossBrl ?? 0
          const goal = json.sellerGoalBrl ?? json.threshold ?? 30000
          const pct = json.sellerCommissionPct ?? json.config?.commissionPct ?? 5
          const commission = totalVendido * (pct / 100)
          setData({
            totalVendidoBrl: totalVendido,
            metaBatida: totalVendido >= goal,
            comissaoPagarBrl: commission,
            comissaoEstimadaBrl: commission,
            progressPct: goal > 0 ? Math.min(100, (totalVendido / goal) * 100) : 0,
            sellerGoalBrl: goal,
            sellerCommissionPct: pct,
            month: now.getMonth() + 1,
            year: now.getFullYear(),
          })
        } else {
          const goal = json.sellerGoalBrl ?? 30000
          const pct = json.sellerCommissionPct ?? 5
          setData({
            totalVendidoBrl: self.totalVendidoBrl ?? 0,
            metaBatida: self.metaBatida ?? false,
            comissaoPagarBrl: self.comissaoPagarBrl ?? 0,
            comissaoEstimadaBrl: self.comissaoPagarBrl ?? 0,
            progressPct: goal > 0 ? Math.min(100, ((self.totalVendidoBrl ?? 0) / goal) * 100) : 0,
            sellerGoalBrl: goal,
            sellerCommissionPct: pct,
            month: json.month ?? now.getMonth() + 1,
            year: json.year ?? now.getFullYear(),
          })
        }
      })
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [sellerId])

  if (loading) return null
  if (!data) return null

  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const monthName = new Date(data.year, data.month - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <div className={`rounded-xl border-2 p-4 ${data.metaBatida ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/10' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-ads-dark-card'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Sua comissão — {monthName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-2xl font-bold text-primary-600">{brl(data.comissaoPagarBrl)}</p>
            {data.metaBatida && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="w-3 h-3" /> META BATIDA
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Vendido este mês</p>
          <p className="text-lg font-semibold">{brl(data.totalVendidoBrl)}</p>
          <p className="text-xs text-gray-400">Meta: {brl(data.sellerGoalBrl)} · {data.sellerCommissionPct}% comissão</p>
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Progresso para a meta</span>
          <span>{data.progressPct.toFixed(0)}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${data.metaBatida ? 'bg-emerald-500' : data.progressPct >= 70 ? 'bg-amber-400' : 'bg-primary-500'}`}
            style={{ width: `${data.progressPct}%` }}
          />
        </div>
        {!data.metaBatida && (
          <p className="text-xs text-gray-400">
            Faltam {brl(Math.max(0, data.sellerGoalBrl - data.totalVendidoBrl))} para bater a meta e desbloquear a comissão completa.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Painel de Registro de Incidente (Queda de Ativo) ────────────────────────

type IncidentResult = {
  ticketNumber: string
  withinWarranty: boolean
  warrantyDays: number
  hoursAfterDelivery: number | null
  status: string
  originalAsset?: { adsId: string; displayName: string } | null
  vendor?: { name: string } | null
  id: string
}

const REASON_OPTIONS = [
  { value: 'CHECKPOINT',        label: 'Checkpoint (verificação de segurança)' },
  { value: 'BAN',               label: 'Ban (conta banida)' },
  { value: 'ACCOUNT_SUSPENDED', label: 'Suspensão pela plataforma' },
  { value: 'QUALITY_ISSUE',     label: 'Problema de qualidade' },
  { value: 'METRICS_ISSUE',     label: 'Métricas inconsistentes' },
  { value: 'OTHER',             label: 'Outro' },
]

function RegistrarQuedaPanel() {
  const [open, setOpen]           = useState(false)
  const [assetId, setAssetId]     = useState('')
  const [reason, setReason]       = useState('ACCOUNT_SUSPENDED')
  const [detail, setDetail]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult]       = useState<IncidentResult | null>(null)
  const [error, setError]         = useState<string | null>(null)

  // Auto-substituição 1-clique
  const [replacing, setReplacing]     = useState(false)
  const [replaceResult, setReplaceResult] = useState<{ adsId: string } | null>(null)

  async function submitIncident(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setResult(null)
    setReplaceResult(null)
    try {
      const res = await fetch('/api/rma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suspendedAccountRaw: assetId.trim(),
          reason,
          reasonDetail: detail.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erro ao registrar incidente')
        return
      }
      setResult(data as IncidentResult)
      setAssetId('')
      setDetail('')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSelfReplace() {
    if (!result) return
    setReplacing(true)
    setError(null)
    try {
      const res = await fetch(`/api/rma/${result.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SELF_REPLACE' }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erro ao processar substituição')
        return
      }
      // Busca o ativo de reposição
      if (data.replacementAssetId) {
        const assetRes = await fetch(`/api/compras/ativos/${data.replacementAssetId}`)
        if (assetRes.ok) {
          const assetData = await assetRes.json()
          setReplaceResult({ adsId: assetData.adsId ?? data.replacementAssetId })
        } else {
          setReplaceResult({ adsId: data.replacementAssetId })
        }
      }
      setResult(null)
    } catch {
      setError('Erro de conexão ao processar substituição.')
    } finally {
      setReplacing(false)
    }
  }

  return (
    <section className="card space-y-3">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setResult(null); setError(null); setReplaceResult(null) }}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-500" />
          <div>
            <h2 className="heading-2">Registrar Queda de Ativo</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Conta caiu? Abra um RMA — o sistema vincula ao fornecedor automaticamente.
            </p>
          </div>
        </div>
        <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="space-y-4 pt-2 border-t border-gray-100 dark:border-gray-800">
          {!result && !replaceResult && (
            <form onSubmit={submitIncident} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    ID do Ativo (ID Público) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="input-field font-mono"
                    placeholder="AA-CONT-000001 ou ID interno"
                    value={assetId}
                    onChange={(e) => setAssetId(e.target.value)}
                    required
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Digite o ID público (AA-...) ou o número de identificação da conta.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Tipo do Erro <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="input-field"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                  >
                    {REASON_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Detalhes adicionais</label>
                <textarea
                  className="input-field min-h-[80px] resize-y"
                  placeholder="Descreva o que aconteceu (opcional, mas ajuda na auditoria do fornecedor)"
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  maxLength={500}
                />
              </div>
              {error && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
              )}
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? 'Registrando...' : '🛡️ Registrar incidente'}
              </button>
            </form>
          )}

          {/* Resultado do ticket criado */}
          {result && !replaceResult && (
            <div className={`rounded-xl border p-4 space-y-3 ${result.withinWarranty ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/10' : 'border-amber-300 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/10'}`}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`w-5 h-5 ${result.withinWarranty ? 'text-emerald-600' : 'text-amber-600'}`} />
                <span className="font-semibold">
                  Ticket {result.ticketNumber} criado
                </span>
                <span className={`ml-auto px-2 py-0.5 rounded text-xs font-bold ${result.withinWarranty ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {result.withinWarranty ? '✅ DENTRO DA GARANTIA' : '⚠️ FORA DA GARANTIA'}
                </span>
              </div>

              {result.originalAsset && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <strong>Ativo:</strong> {result.originalAsset.adsId} — {result.originalAsset.displayName}
                </p>
              )}
              {result.hoursAfterDelivery !== null && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <strong>Tempo após entrega:</strong> {result.hoursAfterDelivery}h
                  {' '}(garantia: {result.warrantyDays}d = {result.warrantyDays * 24}h)
                </p>
              )}

              {result.withinWarranty ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    Este ativo está dentro do prazo de garantia. Você pode solicitar substituição imediata:
                  </p>
                  {error && (
                    <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> {error}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSelfReplace()}
                      disabled={replacing}
                      className="btn-primary text-sm"
                    >
                      {replacing ? 'Processando...' : '⚡ Substituir agora (1 clique)'}
                    </button>
                    <button type="button" onClick={() => { setResult(null); setReplaceResult(null) }} className="btn-secondary text-sm">
                      Registrar outro
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Ativo fora do prazo de garantia. O ticket foi registrado e será analisado pela equipe.
                  </p>
                  <button type="button" onClick={() => { setResult(null) }} className="btn-secondary text-sm">
                    Registrar outro incidente
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Substituição concluída */}
          {replaceResult && (
            <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/10 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                  Substituição concluída com sucesso!
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Novo ativo reservado: <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">{replaceResult.adsId}</code>.
                O custo desta reposição foi registrado automaticamente como débito do fornecedor original.
              </p>
              <button type="button" onClick={() => { setReplaceResult(null); setResult(null) }} className="btn-secondary text-sm">
                Registrar outro incidente
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
