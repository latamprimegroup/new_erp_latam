'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Copy, MessageCircle, QrCode, RefreshCcw, Search, ShoppingCart } from 'lucide-react'

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

export function CommercialSellerClient() {
  const [stock, setStock] = useState<StockResponse | null>(null)
  const [history, setHistory] = useState<CheckoutRow[]>([])
  const [loadingStock, setLoadingStock] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [query, setQuery] = useState('')
  const [onlyActive, setOnlyActive] = useState(true)
  const [historyStatus, setHistoryStatus] = useState<'ALL' | 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED'>('ALL')

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
      const suffix = historyStatus === 'ALL' ? '' : `?status=${historyStatus}`
      const res = await fetch(`/api/commercial/seller/checkouts${suffix}`)
      const data = (await res.json()) as CheckoutResponse | { error?: string }
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Erro ao carregar histórico')
      setHistory((data as CheckoutResponse).items ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar histórico')
    } finally {
      setLoadingHistory(false)
    }
  }, [historyStatus])

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

  const pendingCount = history.filter((h) => h.status === 'PENDING').length
  const paidCount = history.filter((h) => h.status === 'PAID').length

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>
      ) : null}

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

                <div className="text-sm">
                  <span className="font-medium">Disponível agora:</span>{' '}
                  <span className={item.available > 0 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>
                    {item.available}
                  </span>
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
                  <Link href={`/loja/${item.slug}`} target="_blank" className="btn-secondary text-sm">
                    Abrir página pública
                  </Link>
                </div>
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
              {generated.title} · {generated.qty} un. ·{' '}
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

        {loadingHistory ? (
          <p className="text-sm text-gray-500">Carregando histórico...</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum checkout encontrado para o filtro selecionado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-left border-b border-gray-200 dark:border-white/10 text-gray-500">
                  <th className="pb-2 pr-2">ID</th>
                  <th className="pb-2 pr-2">Cliente</th>
                  <th className="pb-2 pr-2">Produto</th>
                  <th className="pb-2 pr-2">Valor</th>
                  <th className="pb-2 pr-2">Status</th>
                  <th className="pb-2 pr-2">Criado em</th>
                  <th className="pb-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 dark:border-white/5">
                    <td className="py-2 pr-2 font-mono text-xs">{item.id.slice(0, 8)}</td>
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
    </div>
  )
}
