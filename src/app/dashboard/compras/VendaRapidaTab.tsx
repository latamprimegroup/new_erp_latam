'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, ExternalLink, MessageCircle, Plus, ToggleLeft, ToggleRight, Trash2, X, CheckCircle2, Clock, TrendingUp, QrCode } from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Listing {
  id:             string
  slug:           string
  title:          string
  subtitle:       string | null
  fullDescription: string | null
  badge:          string | null
  assetCategory:  string
  stockProductCode: string | null
  stockProductName: string | null
  pricePerUnit:   number
  maxQty:         number
  active:         boolean
  available:      number
  totalCheckouts: number
  paidCheckouts:  number
  revenue:        number
  createdAt:      string
}

interface StockProductSuggestion {
  assetId: string
  adsId: string
  displayName: string
  category: string
  salePrice: number
  availableInCategory: number
}

interface GeneratedPix {
  checkoutId:   string
  txid:         string
  pixCopyPaste: string
  qrCodeBase64: string
  expiresAt:    string
  totalAmount:  number
  qty:          number
  title:        string
  resumeUrl:    string
}

const ASSET_CATEGORIES = [
  'GOOGLE_ADS', 'META_ADS', 'TIKTOK_ADS', 'AMAZON_ADS',
  'LINKEDIN_ADS', 'PINTEREST_ADS', 'SNAPCHAT_ADS', 'OTHER',
]

const BASE_URL = typeof window !== 'undefined' ? window.location.origin : ''

function formatCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    .replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})$/, '$1.$2.$3-$4')
    .replace(/(\d{3})(\d{3})(\d{1,3})$/, '$1.$2.$3')
    .replace(/(\d{3})(\d{1,3})$/, '$1.$2')
    .replace(/(\d{1,3})$/, '$1')
}

function formatCnpj(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14)
  return d
    .replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    .replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})$/, '$1.$2.$3/$4')
    .replace(/(\d{2})(\d{3})(\d{1,3})$/, '$1.$2.$3')
    .replace(/(\d{2})(\d{1,3})$/, '$1.$2')
    .replace(/(\d{1,2})$/, '$1')
}

function formatPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

function normalizeWhatsapp(raw: string) {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('55')) return `+${digits}`
  if (digits.length >= 10) return `+55${digits}`
  return ''
}

function escapeRegExp(v: string) {
  return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function renderHighlightedText(text: string, query: string) {
  const q = query.trim()
  if (!q) return text
  const regex = new RegExp(`(${escapeRegExp(q)})`, 'ig')
  const parts = text.split(regex)
  return parts.map((part, idx) =>
    part.toLowerCase() === q.toLowerCase()
      ? <mark key={`${part}-${idx}`} className="bg-emerald-500/20 text-emerald-200 rounded px-0.5">{part}</mark>
      : <span key={`${part}-${idx}`}>{part}</span>,
  )
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function VendaRapidaTab() {
  const [listings, setListings]     = useState<Listing[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [copiedId, setCopiedId]     = useState<string | null>(null)

  // Formulário
  const [title, setTitle]           = useState('')
  const [subtitle, setSubtitle]     = useState('')
  const [fullDescription, setFullDescription] = useState('')
  const [category, setCategory]     = useState('GOOGLE_ADS')
  const [stockProductCode, setStockProductCode] = useState('')
  const [stockProductName, setStockProductName] = useState('')
  const [stockSearch, setStockSearch] = useState('')
  const [stockSuggestions, setStockSuggestions] = useState<StockProductSuggestion[]>([])
  const [stockSearching, setStockSearching] = useState(false)
  const [stockSearchOpen, setStockSearchOpen] = useState(false)
  const [stockHighlightedIndex, setStockHighlightedIndex] = useState(-1)
  const stockSearchWrapRef = useRef<HTMLDivElement | null>(null)
  const stockDropdownRef = useRef<HTMLDivElement | null>(null)
  const [price, setPrice]           = useState('')
  const [maxQty, setMaxQty]         = useState('10')
  const [badge, setBadge]           = useState('ENTREGA AUTOMÁTICA')
  const [selectedListingId, setSelectedListingId] = useState('')

  // Teste rápido PIX integrado
  const [pixBuyerName, setPixBuyerName] = useState('')
  const [pixBuyerWhatsapp, setPixBuyerWhatsapp] = useState('')
  const [pixBuyerEmail, setPixBuyerEmail] = useState('')
  const [pixDocType, setPixDocType] = useState<'cpf' | 'cnpj'>('cpf')
  const [pixDoc, setPixDoc] = useState('')
  const [pixQty, setPixQty] = useState(1)
  const [pixLoading, setPixLoading] = useState(false)
  const [pixError, setPixError] = useState<string | null>(null)
  const [pixResult, setPixResult] = useState<GeneratedPix | null>(null)
  const [copiedPix, setCopiedPix] = useState(false)
  const [pixResultWhatsapp, setPixResultWhatsapp] = useState('')

  const selectedListing = useMemo(
    () => listings.find((l) => l.id === selectedListingId) ?? null,
    [listings, selectedListingId],
  )

  const maxPixQty = selectedListing ? Math.min(selectedListing.maxQty, selectedListing.available) : 0
  const safePixQty = maxPixQty > 0 ? Math.max(1, Math.min(pixQty, maxPixQty)) : 0
  const estimatedPixTotal = selectedListing ? selectedListing.pricePerUnit * safePixQty : 0

  useEffect(() => {
    const q = stockSearch.trim()
    if (q.length < 2) {
      setStockSuggestions([])
      setStockHighlightedIndex(-1)
      return
    }

    const ctrl = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        setStockSearching(true)
        const res = await fetch(`/api/admin/listings/stock-products?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
          cache: 'no-store',
        })
        if (!res.ok) return
        const data = await res.json() as { items?: StockProductSuggestion[] }
        setStockSuggestions(data.items ?? [])
        setStockHighlightedIndex((data.items?.length ?? 0) > 0 ? 0 : -1)
      } catch {
        // ignora erros de rede/abort para não quebrar UX
      } finally {
        setStockSearching(false)
      }
    }, 250)

    return () => {
      ctrl.abort()
      window.clearTimeout(timer)
    }
  }, [stockSearch])

  useEffect(() => {
    if (!stockSearchOpen) return
    const onPointerDownOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (stockSearchWrapRef.current?.contains(target)) return
      setStockSearchOpen(false)
      setStockHighlightedIndex(-1)
    }
    document.addEventListener('mousedown', onPointerDownOutside)
    document.addEventListener('touchstart', onPointerDownOutside)
    return () => {
      document.removeEventListener('mousedown', onPointerDownOutside)
      document.removeEventListener('touchstart', onPointerDownOutside)
    }
  }, [stockSearchOpen])

  useEffect(() => {
    if (!stockSearchOpen || stockHighlightedIndex < 0) return
    const highlightedNode = stockDropdownRef.current
      ?.querySelector<HTMLButtonElement>(`[data-stock-idx="${stockHighlightedIndex}"]`)
    highlightedNode?.scrollIntoView({ block: 'nearest' })
  }, [stockHighlightedIndex, stockSearchOpen])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/listings')
      if (r.ok) {
        const rows = (await r.json()) as Listing[]
        setListings(rows)
        setSelectedListingId((prev) => {
          if (prev && rows.some((l) => l.id === prev)) return prev
          return rows[0]?.id ?? ''
        })
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (maxPixQty <= 0) return
    setPixQty((prev) => Math.max(1, Math.min(prev, maxPixQty)))
  }, [maxPixQty])

  const copyLink = async (slug: string) => {
    const url = `${BASE_URL}/loja/${slug}`
    await navigator.clipboard.writeText(url)
    setCopiedId(slug)
    setTimeout(() => setCopiedId(null), 2500)
  }

  const toggleActive = async (id: string, active: boolean) => {
    await fetch(`/api/admin/listings/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !active }),
    })
    load()
  }

  const deleteListing = async (id: string, title: string) => {
    if (!confirm(`Excluir listing "${title}"? Esta ação não pode ser desfeita.`)) return
    await fetch(`/api/admin/listings/${id}`, { method: 'DELETE' })
    load()
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/admin/listings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:         title.trim(),
        subtitle:      subtitle.trim() || undefined,
        fullDescription: fullDescription.trim() || undefined,
        assetCategory: category,
        stockProductCode: stockProductCode.trim() || undefined,
        stockProductName: stockProductName.trim() || undefined,
        pricePerUnit:  parseFloat(price),
        maxQty:        parseInt(maxQty),
        badge:         badge.trim() || 'ENTREGA AUTOMÁTICA',
        active:        true,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setShowForm(false)
      setTitle('')
      setSubtitle('')
      setFullDescription('')
      setStockProductCode('')
      setStockProductName('')
      setStockSearch('')
      setStockSuggestions([])
      setStockSearchOpen(false)
      setStockHighlightedIndex(-1)
      setPrice('')
      setMaxQty('10')
      setBadge('ENTREGA AUTOMÁTICA')
      load()
    } else {
      const d = await res.json()
      alert(d.error ?? 'Erro ao criar listing')
    }
  }

  const applyStockSuggestion = (item: StockProductSuggestion) => {
    setStockProductCode(item.adsId)
    setStockProductName(item.displayName)
    setCategory(item.category)
    setStockSearch(`${item.adsId} · ${item.displayName}`)
    setStockSearchOpen(false)
    setStockHighlightedIndex(-1)
  }

  const handleStockSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!stockSearchOpen || stockSuggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setStockHighlightedIndex((prev) => (prev + 1) % stockSuggestions.length)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setStockHighlightedIndex((prev) => (prev <= 0 ? stockSuggestions.length - 1 : prev - 1))
      return
    }
    if (e.key === 'Enter') {
      if (stockHighlightedIndex >= 0 && stockHighlightedIndex < stockSuggestions.length) {
        e.preventDefault()
        applyStockSuggestion(stockSuggestions[stockHighlightedIndex])
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setStockSearchOpen(false)
      setStockHighlightedIndex(-1)
    }
  }

  const handleCreatePixTest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedListing) {
      setPixError('Selecione um listing para gerar o PIX.')
      return
    }
    if (selectedListing.available <= 0) {
      setPixError('Esse listing está sem estoque disponível no momento.')
      return
    }

    const docDigits = pixDoc.replace(/\D/g, '')
    if (pixDocType === 'cpf' && docDigits.length !== 11) {
      setPixError('CPF inválido. Informe 11 dígitos.')
      return
    }
    if (pixDocType === 'cnpj' && docDigits.length !== 14) {
      setPixError('CNPJ inválido. Informe 14 dígitos.')
      return
    }

    const finalWhatsapp = normalizeWhatsapp(pixBuyerWhatsapp)
    if (!finalWhatsapp) {
      setPixError('WhatsApp inválido. Use um número BR válido.')
      return
    }

    setPixLoading(true)
    setPixError(null)
    setPixResult(null)
    setCopiedPix(false)
    try {
      const finalQty = Math.max(1, Math.min(pixQty, selectedListing.maxQty, selectedListing.available))
      const payload: Record<string, unknown> = {
        name: pixBuyerName.trim(),
        whatsapp: finalWhatsapp,
        email: pixBuyerEmail.trim() || undefined,
        qty: finalQty,
      }
      if (pixDocType === 'cnpj') payload.cnpj = formatCnpj(pixDoc)
      else payload.cpf = formatCpf(pixDoc)

      const res = await fetch(`/api/loja/${selectedListing.slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as GeneratedPix | { error?: string }
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || 'Falha ao gerar PIX de teste')
      }
      setPixResult(data as GeneratedPix)
      setPixResultWhatsapp(finalWhatsapp)
      await load()
    } catch (err) {
      setPixError(err instanceof Error ? err.message : 'Erro ao gerar PIX de teste')
    } finally {
      setPixLoading(false)
    }
  }

  const copyPixCode = async () => {
    if (!pixResult?.pixCopyPaste) return
    await navigator.clipboard.writeText(pixResult.pixCopyPaste)
    setCopiedPix(true)
    window.setTimeout(() => setCopiedPix(false), 2500)
  }

  const sendPixWhatsapp = () => {
    if (!pixResult) return
    const phone = pixResultWhatsapp.replace(/\D/g, '')
    if (!phone) {
      setPixError('WhatsApp do comprador indisponível para envio.')
      return
    }
    const message = [
      '🚀 PIX gerado na Ads Ativos',
      '',
      `Produto: ${pixResult.title}`,
      `Quantidade: ${pixResult.qty}`,
      `Valor: R$ ${pixResult.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      '',
      'PIX copia e cola:',
      pixResult.pixCopyPaste,
      '',
      `Checkout + Entrega: ${pixResult.resumeUrl}`,
      '',
      'Após o pagamento, o cliente deve preencher a tela de entrega com e-mail AdsPower e confirmar perfil liberado.',
    ].join('\n')
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  }

  const totalRevenue   = listings.reduce((s, l) => s + l.revenue, 0)
  const totalPaid      = listings.reduce((s, l) => s + l.paidCheckouts, 0)
  const totalCheckouts = listings.reduce((s, l) => s + l.totalCheckouts, 0)

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard icon={<TrendingUp className="w-5 h-5 text-emerald-500" />} label="Faturamento" value={`R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
        <KpiCard icon={<CheckCircle2 className="w-5 h-5 text-blue-500" />} label="Vendas aprovadas" value={String(totalPaid)} />
        <KpiCard icon={<Clock className="w-5 h-5 text-amber-500" />} label="PIX gerados" value={String(totalCheckouts)} />
      </div>

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-lg">Links de Venda Rápida</h2>
          <p className="text-zinc-500 text-sm">Gere links públicos de checkout e acompanhe as vendas</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition"
        >
          <Plus className="w-4 h-4" />
          Novo Link
        </button>
      </div>

      {/* Teste rápido de PIX integrado */}
      <section className="border border-zinc-800 rounded-2xl p-5 space-y-4 bg-zinc-900/40">
        <div>
          <h3 className="font-bold text-white">Teste rápido — Gerar PIX integrado</h3>
          <p className="text-zinc-500 text-sm">
            Gera o PIX na hora usando o listing selecionado, sem sair do menu de venda rápida.
          </p>
        </div>

        {listings.length === 0 ? (
          <p className="text-sm text-zinc-500">Crie um listing para habilitar o teste de geração PIX.</p>
        ) : (
          <form className="space-y-3" onSubmit={handleCreatePixTest}>
            <Field label="Listing para teste">
              <select
                className="input-dark"
                value={selectedListingId}
                onChange={(e) => {
                  setSelectedListingId(e.target.value)
                  setPixResult(null)
                  setPixError(null)
                }}
              >
                {listings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title} · disp. {l.available} · R$ {l.pricePerUnit.toFixed(2)}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Nome do cliente">
                <input
                  required
                  className="input-dark"
                  placeholder="Nome completo"
                  value={pixBuyerName}
                  onChange={(e) => setPixBuyerName(e.target.value)}
                />
              </Field>
              <Field label="WhatsApp">
                <input
                  required
                  className="input-dark"
                  placeholder="(11) 99999-9999"
                  value={pixBuyerWhatsapp}
                  onChange={(e) => setPixBuyerWhatsapp(formatPhone(e.target.value))}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="E-mail (opcional)">
                <input
                  className="input-dark"
                  placeholder="cliente@email.com"
                  value={pixBuyerEmail}
                  onChange={(e) => setPixBuyerEmail(e.target.value)}
                />
              </Field>
              <Field label="Quantidade">
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, maxPixQty)}
                  className="input-dark"
                  value={pixQty}
                  onChange={(e) => setPixQty(Number(e.target.value) || 1)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Tipo de documento">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setPixDocType('cpf'); setPixDoc('') }}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition ${
                      pixDocType === 'cpf'
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    CPF
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPixDocType('cnpj'); setPixDoc('') }}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition ${
                      pixDocType === 'cnpj'
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    CNPJ
                  </button>
                </div>
              </Field>
              <Field label={pixDocType === 'cnpj' ? 'CNPJ' : 'CPF'}>
                <input
                  required
                  className="input-dark"
                  placeholder={pixDocType === 'cnpj' ? '00.000.000/0001-00' : '000.000.000-00'}
                  value={pixDoc}
                  onChange={(e) =>
                    setPixDoc(pixDocType === 'cnpj' ? formatCnpj(e.target.value) : formatCpf(e.target.value))
                  }
                />
              </Field>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-300 flex items-center justify-between">
              <span>
                {selectedListing ? `Listing: ${selectedListing.title}` : 'Selecione um listing'}
              </span>
              <span className="font-semibold text-emerald-400">
                {maxPixQty > 0
                  ? `Total estimado: R$ ${estimatedPixTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : 'Sem estoque disponível'}
              </span>
            </div>

            {pixError ? (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">{pixError}</p>
            ) : null}

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition disabled:opacity-50"
              disabled={pixLoading || !selectedListing || maxPixQty <= 0}
            >
              {pixLoading ? 'Gerando PIX integrado...' : 'Gerar PIX de teste'}
            </button>
          </form>
        )}

        {pixResult ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-emerald-300">PIX gerado com sucesso</p>
              <span className="text-xs text-zinc-400">TXID: {pixResult.txid.slice(0, 12)}...</span>
            </div>

            <div className="grid md:grid-cols-[160px_1fr] gap-3 items-start">
              <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-2 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${pixResult.qrCodeBase64}`}
                  alt="QR Code PIX"
                  className="w-36 h-36 rounded"
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-zinc-400">
                  Valor: <span className="text-emerald-300 font-semibold">R$ {pixResult.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  {' '}· Quantidade: {pixResult.qty}
                </p>
                <p className="text-xs text-zinc-400">
                  Expira em: {new Date(pixResult.expiresAt).toLocaleString('pt-BR')}
                </p>
                <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-2">
                  <p className="text-[11px] text-zinc-500 mb-1">PIX copia e cola</p>
                  <p className="text-xs text-zinc-200 font-mono break-all">{pixResult.pixCopyPaste}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={copyPixCode}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium"
                  >
                    <Copy className="w-3.5 h-3.5 inline mr-1" />
                    {copiedPix ? 'PIX copiado!' : 'Copiar PIX'}
                  </button>
                  <a
                    href={pixResult.resumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
                  >
                    <QrCode className="w-3.5 h-3.5 inline mr-1" />
                    Abrir checkout + entrega
                  </a>
                  <button
                    type="button"
                    onClick={sendPixWhatsapp}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                  >
                    <MessageCircle className="w-3.5 h-3.5 inline mr-1" />
                    Enviar no WhatsApp
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* Modal de criação */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-lg">Criar Link de Venda</h3>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <Field label="Nome do produto">
                <input
                  required value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: TikTok Verificada, Google Ads Premium"
                  className="input-dark"
                />
              </Field>
              <Field label="Subtítulo (opcional)">
                <textarea
                  value={subtitle} onChange={(e) => setSubtitle(e.target.value)}
                  rows={3}
                  placeholder="Resumo rápido do produto para o card"
                  className="input-dark"
                />
              </Field>
              <Field label="Descrição completa (copiar e colar)">
                <textarea
                  value={fullDescription} onChange={(e) => setFullDescription(e.target.value)}
                  rows={6}
                  placeholder={`Ex:\n✅ Verificado no Developers\n✅ Ano de Criação: 2018 a 2022\n✅ 2FA + Cookies`}
                  className="input-dark"
                />
              </Field>
              <Field label="Buscar no estoque por código ou nome">
                <div ref={stockSearchWrapRef} className="relative">
                  <input
                    value={stockSearch}
                    onChange={(e) => {
                      setStockSearch(e.target.value)
                      setStockSearchOpen(true)
                    }}
                    onFocus={() => setStockSearchOpen(true)}
                    onKeyDown={handleStockSearchKeyDown}
                    placeholder="Digite AA-CONT-000001 ou nome do produto..."
                    className="input-dark"
                  />
                  {stockSearchOpen && stockSearch.trim().length >= 2 ? (
                    <div
                      ref={stockDropdownRef}
                      className="absolute z-20 mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl max-h-64 overflow-auto"
                    >
                      {stockSearching ? (
                        <p className="px-3 py-2 text-xs text-zinc-400">Buscando no estoque...</p>
                      ) : stockSuggestions.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-zinc-500">Nenhum produto encontrado.</p>
                      ) : (
                        stockSuggestions.map((item, idx) => (
                          <button
                            key={item.assetId}
                            type="button"
                            data-stock-idx={idx}
                            onClick={() => applyStockSuggestion(item)}
                            className={`w-full text-left px-3 py-2 transition border-b border-zinc-800 last:border-b-0 ${
                              idx === stockHighlightedIndex ? 'bg-zinc-800' : 'hover:bg-zinc-800'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs text-zinc-200 font-medium">
                                  {renderHighlightedText(item.adsId, stockSearch)} · {renderHighlightedText(item.displayName, stockSearch)}
                                </p>
                                <p className="text-[11px] text-zinc-500">
                                  {item.category.replace('_', ' ')} · R$ {item.salePrice.toFixed(2)}
                                </p>
                              </div>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                item.availableInCategory > 0
                                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                  : 'border-red-500/40 bg-red-500/10 text-red-300'
                              }`}>
                                Estoque: {item.availableInCategory}
                              </span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </Field>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Código do produto no estoque (opcional)">
                  <input
                    value={stockProductCode}
                    onChange={(e) => setStockProductCode(e.target.value.toUpperCase())}
                    placeholder="AA-CONT-000001"
                    className="input-dark"
                  />
                </Field>
                <Field label="Nome do produto no estoque (opcional)">
                  <input
                    value={stockProductName}
                    onChange={(e) => setStockProductName(e.target.value)}
                    placeholder="Perfil Real Verificado"
                    className="input-dark"
                  />
                </Field>
              </div>
              <p className="text-xs text-zinc-500">
                Se preencher código ou nome, a Venda Rápida vai tentar atrelar e baixar o estoque desse produto automaticamente no pagamento.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Categoria do ativo">
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-dark">
                    {ASSET_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c.replace('_', ' ')}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Preço por unidade (R$)">
                  <input
                    required type="number" min="1" step="0.01"
                    value={price} onChange={(e) => setPrice(e.target.value)}
                    placeholder="150.00"
                    className="input-dark"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Máx. unidades por pedido">
                  <input
                    type="number" min="1" max="100"
                    value={maxQty} onChange={(e) => setMaxQty(e.target.value)}
                    className="input-dark"
                  />
                </Field>
                <Field label="Badge (topo da página)">
                  <input
                    value={badge} onChange={(e) => setBadge(e.target.value)}
                    placeholder="ENTREGA AUTOMÁTICA"
                    className="input-dark"
                  />
                </Field>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-3 rounded-xl border border-zinc-700 text-zinc-400 text-sm hover:text-white transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={saving}
                  className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition disabled:opacity-50"
                >
                  {saving ? 'Criando...' : 'Criar Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista de listings */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <p className="text-4xl mb-3">🛍️</p>
          <p className="font-medium">Nenhum link criado ainda</p>
          <p className="text-sm mt-1">Crie seu primeiro link de venda rápida para começar</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {listings.map((l) => {
            const url = `${BASE_URL}/loja/${l.slug}`
            return (
              <div
                key={l.id}
                className={`border rounded-2xl p-5 space-y-4 transition ${
                  l.active
                    ? 'bg-zinc-900/50 border-zinc-800'
                    : 'bg-zinc-950 border-zinc-800/50 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-base">{l.title}</span>
                      {l.badge && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
                          {l.badge}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        l.active ? 'bg-green-500/10 text-green-400' : 'bg-zinc-700 text-zinc-400'
                      }`}>
                        {l.active ? 'Ativo' : 'Pausado'}
                      </span>
                    </div>
                    {l.subtitle && <p className="text-zinc-500 text-sm mt-0.5">{l.subtitle}</p>}
                    {l.fullDescription && (
                      <p className="text-zinc-400 text-xs mt-1 whitespace-pre-line">{l.fullDescription}</p>
                    )}
                    <p className="text-zinc-600 text-xs mt-1">{l.assetCategory.replace('_', ' ')} · R$ {l.pricePerUnit.toFixed(2)}/un · máx {l.maxQty} un</p>
                    {(l.stockProductCode || l.stockProductName) && (
                      <p className="text-zinc-500 text-[11px] mt-1">
                        Vínculo estoque: {l.stockProductCode || '—'} {l.stockProductName ? `· ${l.stockProductName}` : ''}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleActive(l.id, l.active)}
                      title={l.active ? 'Pausar' : 'Ativar'}
                      className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                    >
                      {l.active ? <ToggleRight className="w-5 h-5 text-emerald-500" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <a
                      href={url} target="_blank" rel="noopener noreferrer"
                      className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                      title="Abrir página"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => deleteListing(l.id, l.title)}
                      className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <StatPill label="Disponível" value={`${l.available} un`} color="emerald" />
                  <StatPill label="PIX gerados" value={String(l.totalCheckouts)} color="blue" />
                  <StatPill label="Faturado" value={`R$ ${l.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} color="amber" />
                </div>

                {/* Link */}
                <div className="flex items-center gap-2 bg-zinc-800/50 border border-zinc-700 rounded-xl px-3 py-2">
                  <span className="text-zinc-400 text-xs font-mono flex-1 truncate">{url}</span>
                  <button
                    onClick={() => copyLink(l.slug)}
                    className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition ${
                      copiedId === l.slug
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                    }`}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copiedId === l.slug ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-3">
      {icon}
      <div>
        <p className="text-zinc-500 text-xs">{label}</p>
        <p className="text-white font-bold text-lg">{value}</p>
      </div>
    </div>
  )
}

function StatPill({ label, value, color }: { label: string; value: string; color: 'emerald' | 'blue' | 'amber' }) {
  const colors = {
    emerald: 'bg-emerald-500/10 text-emerald-400',
    blue:    'bg-blue-500/10 text-blue-400',
    amber:   'bg-amber-500/10 text-amber-400',
  }
  return (
    <div className={`rounded-lg px-3 py-2 text-center ${colors[color]}`}>
      <p className="text-xs opacity-70">{label}</p>
      <p className="font-bold text-sm">{value}</p>
    </div>
  )
}
