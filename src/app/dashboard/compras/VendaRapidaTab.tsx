'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Clipboard, Copy, ExternalLink, MessageCircle, Pencil, Plus, ToggleLeft, ToggleRight, Trash2, X, CheckCircle2, Clock, TrendingUp, QrCode, Zap } from 'lucide-react'
import { QuickSaleSecurityPanel } from './QuickSaleSecurityPanel'

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
  stockQtyConfigured?: number | null
  stockQtyRemaining?: number | null
  paymentMode?: 'PIX' | 'GLOBAL'
  globalGateways?: ('KAST' | 'MERCURY')[]
  paymentMethods?: ('PIX' | 'KAST' | 'MERCURY')[]
  active:         boolean
  available:      number
  totalCheckouts: number
  paidCheckouts:  number
  revenue:        number
  createdAt:      string
}

type CreateListingResponse = {
  slug?: string
  title?: string
  paymentMode?: 'PIX' | 'GLOBAL'
  error?: string
  code?: string
  requestedStockQty?: number
  suggestedStockQty?: number
  canForce?: boolean
}

interface StockProductSuggestion {
  assetId: string
  adsId: string
  displayName: string
  category: string
  salePrice: number
  isAvailable: boolean
  availableInCategory: number
  availableForName: number
  totalInBaseForName: number
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
  orderNumber:  string | null  // ID do pedido gerado atomicamente (VR-000001)
}

type VendaRapidaTabProps = {
  defaultPaymentMode?: 'PIX' | 'GLOBAL'
  listingModeFilter?: 'PIX' | 'GLOBAL' | 'ALL'
  showSecurityPanel?: boolean
  /** Quando true, exibe valores em USD e troca labels PIX por Mercury/Kast */
  globalMode?: boolean
}

const ASSET_CATEGORIES = [
  'GOOGLE_ADS', 'META_ADS', 'TIKTOK_ADS', 'AMAZON_ADS',
  'LINKEDIN_ADS', 'PINTEREST_ADS', 'SNAPCHAT_ADS', 'OTHER',
]

function getRuntimeBaseUrl() {
  if (typeof window !== 'undefined') return window.location.origin
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? ''
}

function buildPublicCheckoutUrl(slug: string) {
  return buildInvisibleCheckoutUrl(slug, 'PIX')
}

function buildPublicGlobalCheckoutUrl(slug: string) {
  return buildInvisibleCheckoutUrl(slug, 'GLOBAL')
}

function buildInvisibleCheckoutUrl(slug: string, mode?: 'PIX' | 'GLOBAL') {
  const base = getRuntimeBaseUrl()
  const search = new URLSearchParams({
    slug,
    mode: mode === 'GLOBAL' ? 'GLOBAL' : 'PIX',
  })
  return `${base}/pay/one/new?${search.toString()}`
}

function formatBrl(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function buildPreviewSlug(raw: string) {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

async function issueInvisibleCheckoutUrl(input: { slug: string; mode?: 'PIX' | 'GLOBAL' }) {
  const mode = input.mode === 'GLOBAL' ? 'GLOBAL' : 'PIX'
  const params = new URLSearchParams({
    slug: input.slug,
    mode,
  })
  const res = await fetch(`/api/invisible-checkout/issue?${params.toString()}`, { cache: 'no-store' })
  const data = await res.json().catch(() => ({})) as {
    secureCheckoutUrl?: string
    error?: string
  }
  if (!res.ok || !data.secureCheckoutUrl) {
    throw new Error(data.error ?? 'Não foi possível gerar link efêmero agora.')
  }
  return data.secureCheckoutUrl
}

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

function getSuggestedLinkStock(item: StockProductSuggestion) {
  return Math.max(1, item.availableForName || item.availableInCategory || item.totalInBaseForName || 1)
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function VendaRapidaTab({
  defaultPaymentMode = 'PIX',
  listingModeFilter = 'ALL',
  showSecurityPanel = true,
  globalMode = false,
}: VendaRapidaTabProps) {
  const [listings, setListings]     = useState<Listing[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [copiedId, setCopiedId]     = useState<string | null>(null)
  const [generatedLink, setGeneratedLink] = useState('')
  const [generatedLinkTitle, setGeneratedLinkTitle] = useState('')
  const [generatedLinkCopied, setGeneratedLinkCopied] = useState(false)
  const [syncingStockListingId, setSyncingStockListingId] = useState<string | null>(null)
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1)
  const [editingListingId, setEditingListingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ title: '', price: '', maxQty: '', stockQty: '', badge: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Formulário
  const [title, setTitle]           = useState('')
  const [subtitle, setSubtitle]     = useState('')
  const [fullDescription, setFullDescription] = useState('')
  const [category, setCategory]     = useState('GOOGLE_ADS')
  const [stockProductCode, setStockProductCode] = useState('')
  const [stockProductName, setStockProductName] = useState('')
  const [selectedStockInfo, setSelectedStockInfo] = useState<StockProductSuggestion | null>(null)
  const [stockSearch, setStockSearch] = useState('')
  const [stockSuggestions, setStockSuggestions] = useState<StockProductSuggestion[]>([])
  const [stockSearching, setStockSearching] = useState(false)
  const [stockSearchOpen, setStockSearchOpen] = useState(false)
  const [stockHighlightedIndex, setStockHighlightedIndex] = useState(-1)
  const [stockOnlyAvailable, setStockOnlyAvailable] = useState(true)
  const stockSearchWrapRef = useRef<HTMLDivElement | null>(null)
  const stockDropdownRef = useRef<HTMLDivElement | null>(null)
  const [price, setPrice]           = useState('')
  const [maxQty, setMaxQty]         = useState('10')
  const [stockQty, setStockQty]     = useState('1')
  const [paymentMode, setPaymentMode] = useState<'PIX' | 'GLOBAL'>(defaultPaymentMode)
  const [globalGatewayKast, setGlobalGatewayKast] = useState(true)
  const [globalGatewayMercury, setGlobalGatewayMercury] = useState(true)
  const [copyAutoFilledFromStock, setCopyAutoFilledFromStock] = useState(false)
  const [badge, setBadge]           = useState('ENTREGA AUTOMÁTICA')
  const [commissionPct, setCommissionPct] = useState('10')
  const [estimatedUnitCost, setEstimatedUnitCost] = useState('')
  const [selectedListingId, setSelectedListingId] = useState('')
  const fixedMode = listingModeFilter === 'ALL' ? null : listingModeFilter

  const selectedGlobalGateways = useMemo(() => {
    const methods: ('KAST' | 'MERCURY')[] = []
    if (globalGatewayKast) methods.push('KAST')
    if (globalGatewayMercury) methods.push('MERCURY')
    return methods
  }, [globalGatewayKast, globalGatewayMercury])
  const effectivePaymentMode: 'PIX' | 'GLOBAL' = fixedMode ?? paymentMode
  const normalizedTitle = title.trim()
  const parsedPrice = Number.parseFloat(price)
  const parsedMaxQty = Number.parseInt(maxQty, 10)
  const parsedStockQty = Number.parseInt(stockQty, 10)
  const parsedCommissionPct = Number.parseFloat(commissionPct)
  const parsedEstimatedUnitCost = Number.parseFloat(estimatedUnitCost)
  const isStep1Valid = Boolean(selectedStockInfo)
  const isStep2Valid = normalizedTitle.length >= 3
  const isPriceValid = Number.isFinite(parsedPrice) && parsedPrice > 0
  const isMaxQtyValid = Number.isFinite(parsedMaxQty) && parsedMaxQty >= 1
  const isStockQtyValid = Number.isFinite(parsedStockQty) && parsedStockQty >= 1
  const isCommissionPctValid = Number.isFinite(parsedCommissionPct) && parsedCommissionPct >= 0 && parsedCommissionPct <= 100
  const hasEstimatedUnitCost = estimatedUnitCost.trim().length > 0
  const isEstimatedUnitCostValid = !hasEstimatedUnitCost || (Number.isFinite(parsedEstimatedUnitCost) && parsedEstimatedUnitCost >= 0)
  const effectiveCommissionPct = isCommissionPctValid ? parsedCommissionPct : 0
  const isGlobalGatewayValid = effectivePaymentMode !== 'GLOBAL' || selectedGlobalGateways.length > 0
  const wizardProgressPct = createStep === 1 ? 33 : createStep === 2 ? 66 : 100
  const summaryProductName = normalizedTitle || selectedStockInfo?.displayName || 'Não definido'
  const summaryStockCode = stockProductCode.trim() || selectedStockInfo?.adsId || 'Não definido'
  const summaryStockName = stockProductName.trim() || selectedStockInfo?.displayName || 'Não definido'
  const summaryModeLabel = effectivePaymentMode === 'GLOBAL' ? 'Venda rápida Global' : 'Venda rápida PIX (Brasil)'
  const summaryPriceLabel = isPriceValid
    ? formatBrl(parsedPrice)
    : 'Preço pendente'
  const summaryMaxQtyLabel = isMaxQtyValid ? String(parsedMaxQty) : 'Quantidade pendente'
  const summaryStockQtyLabel = isStockQtyValid ? String(parsedStockQty) : 'Quantidade pendente'
  const summaryPotentialMaxValue = isPriceValid && isMaxQtyValid
    ? parsedPrice * parsedMaxQty
    : null
  const estimatedCommissionPerUnit = isPriceValid ? parsedPrice * (effectiveCommissionPct / 100) : null
  const estimatedCommissionPerOrder = estimatedCommissionPerUnit != null && isMaxQtyValid
    ? estimatedCommissionPerUnit * parsedMaxQty
    : null
  const estimatedNetPerUnit = estimatedCommissionPerUnit != null ? parsedPrice - estimatedCommissionPerUnit : null
  const estimatedNetPerOrder = estimatedCommissionPerOrder != null && summaryPotentialMaxValue != null
    ? summaryPotentialMaxValue - estimatedCommissionPerOrder
    : null
  const estimatedMarginPerUnit = isPriceValid && hasEstimatedUnitCost && isEstimatedUnitCostValid
    ? parsedPrice - parsedEstimatedUnitCost - (estimatedCommissionPerUnit ?? 0)
    : null
  const estimatedMarginPerOrder = estimatedMarginPerUnit != null && isMaxQtyValid
    ? estimatedMarginPerUnit * parsedMaxQty
    : null
  const estimatedMarginPct = estimatedMarginPerUnit != null && parsedPrice > 0
    ? (estimatedMarginPerUnit / parsedPrice) * 100
    : null
  const isEstimatedMarginNegative = estimatedMarginPerUnit != null && estimatedMarginPerUnit < 0
  const summaryPotentialMaxValueLabel = summaryPotentialMaxValue != null
    ? formatBrl(summaryPotentialMaxValue)
    : 'Pendente'
  const createPreviewSlug = useMemo(
    () => buildPreviewSlug(title.trim() || selectedStockInfo?.displayName || ''),
    [title, selectedStockInfo],
  )
  const createPreviewUrl = createPreviewSlug
    ? buildInvisibleCheckoutUrl(createPreviewSlug, effectivePaymentMode)
    : ''
  const canSubmitCreateStepThree =
    isPriceValid &&
    isMaxQtyValid &&
    isStockQtyValid &&
    isGlobalGatewayValid

  // Colar e Vender — parse de texto bruto do fornecedor
  const [showColarVender, setShowColarVender] = useState(false)
  const [colarTexto, setColarTexto] = useState('')
  const [colarParsed, setColarParsed] = useState<{
    displayName: string
    productCode: string
    salePrice: string
    qty: string
    category: string
    notes: string
  } | null>(null)
  const [colarSaving, setColarSaving] = useState(false)
  const [colarMsg, setColarMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const parseColarTexto = (raw: string) => {
    const text = raw.trim()
    if (!text) return

    // Extrai campos com regex permissivos
    const idMatch      = text.match(/(?:ID|Código|Cod|Conta)[:\s]+([A-Z0-9\-]+)/i)
    const gastoMatch   = text.match(/(?:Gasto|Spend|Gastos)[:\s]+([\d.,]+\s*[kKmM]?)/i)
    const nichoMatch   = text.match(/(?:Nicho|Niche|Segmento)[:\s]+([^\n,|]+)/i)
    const anoMatch     = text.match(/(?:Ano|Safra|Year)[:\s]+(\d{4})/i)
    const pagMatch     = text.match(/(?:Pag(?:amento)?|Pay)[:\s]+(Manual|Auto|Automático)/i)
    const precoMatch   = text.match(/(?:Preço|Preco|Price|Valor)[:\s]+R?\$?\s*([\d.,]+)/i)
    const qtyMatch     = text.match(/(?:Qtd|Quantidade|Qty|Unidades?)[:\s]+(\d+)/i)

    // Detecta plataforma pelo texto
    let detectedCategory = category
    if (/tiktok/i.test(text))    detectedCategory = 'TIKTOK_ADS'
    else if (/meta|facebook|fb/i.test(text)) detectedCategory = 'META_ADS'
    else if (/google/i.test(text)) detectedCategory = 'GOOGLE_ADS'
    else if (/linkedin/i.test(text)) detectedCategory = 'LINKEDIN_ADS'
    else if (/amazon/i.test(text)) detectedCategory = 'AMAZON_ADS'

    // Formata gasto para nome
    const gastoRaw = gastoMatch?.[1]?.trim() ?? ''
    const nichoRaw = nichoMatch?.[1]?.trim() ?? ''
    const anoRaw   = anoMatch?.[1]?.trim() ?? ''
    const pagRaw   = pagMatch?.[1]?.trim() ?? ''
    const idRaw    = idMatch?.[1]?.trim() ?? ''

    const nameParts: string[] = []
    const platform = detectedCategory.replace('_ADS', '')
    nameParts.push(platform)
    if (nichoRaw) nameParts.push(nichoRaw)
    if (gastoRaw) nameParts.push(`Gasto ${gastoRaw}`)
    if (anoRaw)   nameParts.push(`Safra ${anoRaw}`)
    if (pagRaw)   nameParts.push(pagRaw)

    const noteParts: string[] = []
    if (idRaw)   noteParts.push(`ID original: ${idRaw}`)
    if (anoRaw)  noteParts.push(`Safra: ${anoRaw}`)
    if (pagRaw)  noteParts.push(`Pag: ${pagRaw}`)

    const precoNum = precoMatch
      ? Number(precoMatch[1].replace(',', '.'))
      : 0

    setColarParsed({
      displayName:  nameParts.join(' · ') || text.slice(0, 80),
      productCode:  idRaw || '',
      salePrice:    precoNum > 0 ? String(precoNum) : '',
      qty:          qtyMatch?.[1] ?? '1',
      category:     detectedCategory,
      notes:        noteParts.join(' | '),
    })
  }

  const handleColarVender = async () => {
    if (!colarParsed) return
    setColarSaving(true)
    setColarMsg(null)
    try {
      const res = await fetch('/api/admin/estoque-rapido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category:    colarParsed.category,
          displayName: colarParsed.displayName,
          productCode: colarParsed.productCode || undefined,
          salePrice:   Number(colarParsed.salePrice) || 150,
          qty:         Number(colarParsed.qty) || 1,
          notes:       colarParsed.notes || undefined,
        }),
      })
      const data = await res.json().catch(() => ({})) as {
        ok?: boolean; qty?: number; message?: string; error?: string
        assets?: Array<{ adsId: string; displayName: string }>
      }
      if (res.ok && data.ok) {
        // Seleciona automaticamente o produto criado no autocomplete
        const firstAsset = data.assets?.[0]
        if (firstAsset) {
          const sug: StockProductSuggestion = {
            assetId: firstAsset.adsId,
            adsId: firstAsset.adsId,
            displayName: firstAsset.displayName,
            category: colarParsed.category,
            salePrice: Number(colarParsed.salePrice) || 150,
            isAvailable: true,
            availableInCategory: Number(colarParsed.qty) || 1,
            availableForName: Number(colarParsed.qty) || 1,
            totalInBaseForName: Number(colarParsed.qty) || 1,
          }
          applyStockSuggestion(sug)
        }
        setColarMsg({ type: 'ok', text: `✅ ${data.qty} unidade(s) adicionada(s) e produto selecionado! Continue para a próxima etapa.` })
        setColarTexto('')
        setColarParsed(null)
        setShowColarVender(false)
      } else {
        setColarMsg({ type: 'err', text: data.error ?? 'Erro ao adicionar.' })
      }
    } finally {
      setColarSaving(false)
    }
  }

  // Estoque Rápido
  const [showEstoqueRapido, setShowEstoqueRapido] = useState(false)
  const [estoqueRapidoForm, setEstoqueRapidoForm] = useState({
    displayName: '', productCode: '', salePrice: '', qty: '1', notes: '',
  })
  const [estoqueRapidoSaving, setEstoqueRapidoSaving] = useState(false)
  const [estoqueRapidoMsg, setEstoqueRapidoMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const handleEstoqueRapido = async () => {
    setEstoqueRapidoSaving(true)
    setEstoqueRapidoMsg(null)
    try {
      const res = await fetch('/api/admin/estoque-rapido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category:    category,
          displayName: estoqueRapidoForm.displayName.trim(),
          productCode: estoqueRapidoForm.productCode.trim() || undefined,
          salePrice:   Number(estoqueRapidoForm.salePrice),
          qty:         Number(estoqueRapidoForm.qty) || 1,
          notes:       estoqueRapidoForm.notes.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; qty?: number; message?: string; error?: string }
      if (res.ok && data.ok) {
        setEstoqueRapidoMsg({ type: 'ok', text: data.message ?? `${data.qty} unidade(s) adicionada(s) ao estoque!` })
        setEstoqueRapidoForm({ displayName: '', productCode: '', salePrice: '', qty: '1', notes: '' })
        // Recarrega sugestões de estoque para refletir o novo item
        if (estoqueRapidoForm.displayName.trim()) {
          setStockSearch(estoqueRapidoForm.displayName.trim())
          setStockSearchOpen(true)
        }
      } else {
        setEstoqueRapidoMsg({ type: 'err', text: data.error ?? 'Erro ao adicionar estoque.' })
      }
    } finally {
      setEstoqueRapidoSaving(false)
    }
  }

  // ─── Carrinho multi-produto ───────────────────────────────────────────────

  type CartItem = { listingId: string; title: string; unitPrice: number; qty: number; available: number }
  type CartPixResult = {
    orderNumber: string | null
    checkoutId: string
    txid: string
    pixCopyPaste: string
    qrCodeBase64: string
    expiresAt: string
    subtotal: number
    desconto: number
    totalAmount: number
    resumeUrl: string
    lineItems: Array<{ title: string; qty: number; unitPrice: number; lineTotal: number }>
  }

  const [cartItems, setCartItems]       = useState<CartItem[]>([])
  const [cartBuyerName, setCartBuyerName]   = useState('')
  const [cartBuyerWhatsapp, setCartBuyerWhatsapp] = useState('')
  const [cartBuyerEmail, setCartBuyerEmail] = useState('')
  const [cartDocType, setCartDocType]   = useState<'cpf' | 'cnpj'>('cpf')
  const [cartDoc, setCartDoc]           = useState('')
  const [cartDesconto, setCartDesconto] = useState('')
  const [cartNote, setCartNote]         = useState('')
  const [cartLoading, setCartLoading]   = useState(false)
  const [cartError, setCartError]       = useState<string | null>(null)
  const [cartResult, setCartResult]     = useState<CartPixResult | null>(null)
  const [cartCopied, setCartCopied]     = useState(false)
  const [cartAddingId, setCartAddingId] = useState('')

  const cartSubtotal = cartItems.reduce((s, i) => s + i.unitPrice * i.qty, 0)
  const cartDescontoNum = Math.min(cartSubtotal, Number(cartDesconto) || 0)
  const cartTotal = Math.max(0.01, cartSubtotal - cartDescontoNum)

  const addToCart = (listing: Listing) => {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.listingId === listing.id)
      if (existing) {
        return prev.map((i) =>
          i.listingId === listing.id
            ? { ...i, qty: Math.min(i.qty + 1, listing.maxQty, listing.available) }
            : i
        )
      }
      return [...prev, {
        listingId: listing.id,
        title:     listing.title,
        unitPrice: listing.pricePerUnit,
        qty:       1,
        available: listing.available,
      }]
    })
  }

  const removeFromCart = (listingId: string) => {
    setCartItems((prev) => prev.filter((i) => i.listingId !== listingId))
  }

  const updateCartQty = (listingId: string, qty: number) => {
    setCartItems((prev) => prev.map((i) =>
      i.listingId === listingId
        ? { ...i, qty: Math.max(1, Math.min(qty, i.available)) }
        : i
    ))
  }

  const handleCartCheckout = async (e: React.FormEvent) => {
    e.preventDefault()
    if (cartItems.length === 0) { setCartError('Adicione pelo menos 1 produto ao carrinho.'); return }

    const docDigits = cartDoc.replace(/\D/g, '')
    if (cartDocType === 'cpf'  && docDigits.length !== 11) { setCartError('CPF inválido.'); return }
    if (cartDocType === 'cnpj' && docDigits.length !== 14) { setCartError('CNPJ inválido.'); return }
    const wa = normalizeWhatsapp(cartBuyerWhatsapp)
    if (!wa) { setCartError('WhatsApp inválido.'); return }

    setCartLoading(true)
    setCartError(null)
    setCartResult(null)
    setCartCopied(false)

    try {
      const payload: Record<string, unknown> = {
        items:         cartItems.map((i) => ({ listingId: i.listingId, qty: i.qty })),
        buyerName:     cartBuyerName.trim(),
        buyerWhatsapp: wa,
        buyerEmail:    cartBuyerEmail.trim() || undefined,
        descontoTotal: cartDescontoNum,
        note:          cartNote.trim() || undefined,
      }
      if (cartDocType === 'cnpj') payload.buyerCnpj = formatCnpj(cartDoc)
      else payload.buyerCpf = formatCpf(cartDoc)

      const res  = await fetch('/api/admin/carrinho', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({})) as CartPixResult & { error?: string }
      if (!res.ok) { setCartError(data.error ?? 'Erro ao gerar PIX.'); return }
      setCartResult(data)
      await load()
    } finally {
      setCartLoading(false)
    }
  }

  const copyCartPix = async () => {
    if (!cartResult?.pixCopyPaste) return
    await navigator.clipboard.writeText(cartResult.pixCopyPaste)
    setCartCopied(true)
    setTimeout(() => setCartCopied(false), 2500)
  }

  const sendCartWhatsapp = () => {
    if (!cartResult) return
    const phone = cartBuyerWhatsapp.replace(/\D/g, '')
    const lines: string[] = [
      '🛒 Carrinho — Ads Ativos',
      '',
      ...cartResult.lineItems.map((li) => `• ${li.qty}x ${li.title} — R$ ${li.lineTotal.toFixed(2)}`),
    ]
    if (cartResult.desconto > 0) lines.push(`Desconto: -R$ ${cartResult.desconto.toFixed(2)}`)
    lines.push(`Total: R$ ${cartResult.totalAmount.toFixed(2)}`, '', 'PIX copia e cola:', cartResult.pixCopyPaste, '', `Pedido: ${cartResult.resumeUrl}`)
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener,noreferrer')
  }

  // Teste rápido PIX integrado (single product — mantido para compatibilidade)
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

  const filteredListings = useMemo(
    () => listingModeFilter === 'ALL'
      ? listings
      : listings.filter((l) => (l.paymentMode ?? 'PIX') === listingModeFilter),
    [listings, listingModeFilter],
  )

  const selectedListing = useMemo(
    () => filteredListings.find((l) => l.id === selectedListingId) ?? null,
    [filteredListings, selectedListingId],
  )

  const maxPixQty = selectedListing ? Math.min(selectedListing.maxQty, selectedListing.available) : 0
  const safePixQty = maxPixQty > 0 ? Math.max(1, Math.min(pixQty, maxPixQty)) : 0
  const estimatedPixTotal = selectedListing ? selectedListing.pricePerUnit * safePixQty : 0

  useEffect(() => {
    const q = stockSearch.trim()
    if (q.length < 1) {
      setStockSuggestions([])
      setStockHighlightedIndex(-1)
      return
    }

    const ctrl = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        setStockSearching(true)
        const params = new URLSearchParams({
          q,
          onlyAvailable: stockOnlyAvailable ? '1' : '0',
        })
        const res = await fetch(`/api/admin/listings/stock-products?${params.toString()}`, {
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
  }, [stockSearch, stockOnlyAvailable])

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
    setSelectedListingId((prev) => {
      if (prev && filteredListings.some((l) => l.id === prev)) return prev
      return filteredListings[0]?.id ?? ''
    })
  }, [filteredListings])
  useEffect(() => {
    if (listingModeFilter === 'PIX' || listingModeFilter === 'GLOBAL') {
      setPaymentMode(listingModeFilter)
    }
  }, [listingModeFilter])
  useEffect(() => {
    if (maxPixQty <= 0) return
    setPixQty((prev) => Math.max(1, Math.min(prev, maxPixQty)))
  }, [maxPixQty])

  const copyLink = async (slug: string, mode?: 'PIX' | 'GLOBAL') => {
    try {
      const url = await issueInvisibleCheckoutUrl({ slug, mode })
      await navigator.clipboard.writeText(url)
      setCopiedId(slug)
      setTimeout(() => setCopiedId(null), 2500)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao gerar link efêmero.'
      alert(message)
    }
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

  const openEdit = (l: Listing) => {
    setEditForm({
      title:    l.title,
      price:    l.pricePerUnit.toFixed(2),
      maxQty:   String(l.maxQty),
      stockQty: String(l.stockQtyConfigured ?? l.available ?? 1),
      badge:    l.badge ?? '',
    })
    setEditError(null)
    setEditingListingId(l.id)
  }

  const saveEdit = async (id: string) => {
    setEditSaving(true)
    setEditError(null)
    try {
      const res = await fetch(`/api/admin/listings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:        editForm.title.trim(),
          pricePerUnit: Number(editForm.price),
          maxQty:       Number(editForm.maxQty) || 10,
          stockQty:     Number(editForm.stockQty) || 1,
          badge:        editForm.badge.trim() || null,
          forceStockQty: true,
        }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) { setEditError(data.error ?? 'Erro ao salvar.'); return }
      setEditingListingId(null)
      load()
    } finally {
      setEditSaving(false)
    }
  }

  const openCreateModal = (mode?: 'PIX' | 'GLOBAL') => {
    if (!fixedMode && mode) {
      setPaymentMode(mode)
    }
    if (fixedMode) {
      setPaymentMode(fixedMode)
    }
    setCreateStep(1)
    setShowForm(true)
  }

  const advanceCreateStep = () => {
    if (createStep === 1) {
      if (!isStep1Valid) {
        alert('Selecione um produto da base no autocomplete para continuar.')
        return
      }
      setCreateStep(2)
      return
    }

    if (createStep === 2) {
      if (!isStep2Valid) {
        alert('Informe um título comercial com pelo menos 3 caracteres para continuar.')
        return
      }
      setCreateStep(3)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (createStep < 3) {
      advanceCreateStep()
      return
    }
    if (!selectedStockInfo) {
      alert('Vínculo obrigatório: selecione um produto da base via autocomplete.')
      setCreateStep(1)
      return
    }
    if (effectivePaymentMode === 'GLOBAL' && selectedGlobalGateways.length === 0) {
      alert('Selecione pelo menos um gateway global para gerar o link.')
      return
    }
    const payloadBase = {
      title:         normalizedTitle,
      subtitle:      subtitle.trim() || undefined,
      fullDescription: fullDescription.trim() || undefined,
      assetCategory: category,
      stockProductCode: stockProductCode.trim() || undefined,
      stockProductName: stockProductName.trim() || undefined,
      pricePerUnit:  parsedPrice,
      maxQty:        parsedMaxQty,
      stockQty:      parsedStockQty,
      paymentMode: effectivePaymentMode,
      globalGateways: selectedGlobalGateways,
      badge:         badge.trim() || 'ENTREGA AUTOMÁTICA',
      active:        true,
    }

    const submitCreate = async (forceStockQty: boolean) => fetch('/api/admin/listings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payloadBase,
        forceStockQty,
      }),
    })

    setSaving(true)
    try {
      let res = await submitCreate(false)
      let data = await res.json().catch(() => ({})) as CreateListingResponse

      if (!res.ok && data.code === 'STOCK_QTY_ABOVE_SUGGESTED' && data.canForce) {
        const shouldForce = window.confirm(
          `O estoque solicitado (${data.requestedStockQty ?? parseInt(stockQty, 10)}) está acima do sugerido (${data.suggestedStockQty ?? 1}).\n\nDeseja forçar mesmo assim?`,
        )
        if (shouldForce) {
          res = await submitCreate(true)
          data = await res.json().catch(() => ({})) as CreateListingResponse
        }
      }

      if (res.ok) {
        if (data.slug) {
          const generatedMode = data.paymentMode ?? effectivePaymentMode
          const link = await issueInvisibleCheckoutUrl({
            slug: data.slug,
            mode: generatedMode,
          }).catch(() => buildInvisibleCheckoutUrl(data.slug as string, generatedMode))
          setGeneratedLink(link)
          setGeneratedLinkTitle(data.title ?? title.trim())
          setGeneratedLinkCopied(false)
        }
        setShowForm(false)
        setTitle('')
        setSubtitle('')
        setFullDescription('')
        setStockProductCode('')
        setStockProductName('')
        setSelectedStockInfo(null)
        setStockSearch('')
        setStockSuggestions([])
        setStockSearchOpen(false)
        setStockHighlightedIndex(-1)
        setPrice('')
        setMaxQty('10')
        setStockQty('1')
        setPaymentMode(fixedMode ?? defaultPaymentMode)
        setGlobalGatewayKast(true)
        setGlobalGatewayMercury(true)
        setCopyAutoFilledFromStock(false)
        setBadge('ENTREGA AUTOMÁTICA')
        setCommissionPct('10')
        setEstimatedUnitCost('')
        setCreateStep(1)
        load()
        return
      }

      if (data.code === 'STOCK_QTY_ABOVE_SUGGESTED') {
        alert(`${data.error ?? 'Estoque do link acima do sugerido pela base.'}\nAjuste o estoque ou use forçar (ADMIN/CEO).`)
        return
      }

      alert(data.error ?? 'Erro ao criar listing')
    } finally {
      setSaving(false)
    }
  }

  const syncListingStock = async (listing: Listing) => {
    setSyncingStockListingId(listing.id)
    try {
      const res = await fetch(`/api/admin/listings/${listing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncStockQty: true }),
      })
      const data = await res.json().catch(() => ({})) as {
        error?: string
        stockQtyConfigured?: number | null
        suggestedStockQty?: number
      }
      if (!res.ok) {
        alert(data.error ?? 'Erro ao sincronizar estoque do link.')
        return
      }
      await load()
      alert(
        `Estoque do link sincronizado com a base: ${data.stockQtyConfigured ?? data.suggestedStockQty ?? listing.stockQtyConfigured ?? 1}.`,
      )
    } finally {
      setSyncingStockListingId(null)
    }
  }

  const copyGeneratedLink = async () => {
    if (!generatedLink) return
    await navigator.clipboard.writeText(generatedLink)
    setGeneratedLinkCopied(true)
    window.setTimeout(() => setGeneratedLinkCopied(false), 2200)
  }

  const applyStockSuggestion = (item: StockProductSuggestion) => {
    setStockProductCode(item.adsId)
    setStockProductName(item.displayName)
    setCategory(item.category)
    setTitle(item.displayName)
    setSubtitle(`⚡ Código: ${item.adsId}`)
    setFullDescription([
      `✅ Produto da base: ${item.displayName}`,
      `⚡ ID público: ${item.adsId}`,
      `🛰️ Categoria: ${item.category.replace('_', ' ')}`,
      item.isAvailable ? '✅ Estoque disponível agora' : '⏳ Estoque sem disponibilidade imediata',
    ].join('\n'))
    if (Number.isFinite(item.salePrice) && item.salePrice > 0) {
      setPrice(item.salePrice.toFixed(2))
    }
    const suggestedStock = getSuggestedLinkStock(item)
    setStockQty(String(suggestedStock))
    setMaxQty(String(Math.max(1, Math.min(100, suggestedStock))))
    setCopyAutoFilledFromStock(true)
    setSelectedStockInfo(item)
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
        acceptTerms: true,
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
    const orderId = pixResult.orderNumber ?? pixResult.checkoutId
    const message = [
      `Segue ordem de pedido de compra aberta, *ADS ATIVOS #${orderId}*.`,
      '',
      `Produto: *${pixResult.title}*`,
      `Quantidade: ${pixResult.qty} unidade(s)`,
      `Valor: *R$ ${pixResult.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*`,
      '',
      `Segue seu link seguro para pagamento:`,
      pixResult.resumeUrl,
      '',
      `Pague dentro de *20 minutos* no máximo, caso contrário o link expira!`,
      '',
      `📋 PIX Copia e Cola:`,
      pixResult.pixCopyPaste,
    ].join('\n')
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  }

  const totalRevenue   = filteredListings.reduce((s, l) => s + l.revenue, 0)
  const totalPaid      = filteredListings.reduce((s, l) => s + l.paidCheckouts, 0)
  const totalCheckouts = filteredListings.reduce((s, l) => s + l.totalCheckouts, 0)

  // Para modo GLOBAL: converte BRL → USD usando taxa fixa de exibição
  // (o backend armazena em BRL; para exibir em USD usamos taxa aproximada)
  const USD_DISPLAY_RATE = 5.2
  const revenueLabel = globalMode
    ? `$ ${(totalRevenue / USD_DISPLAY_RATE).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  const checkoutsLabel = globalMode ? 'Links Mercury/USDT' : 'PIX gerados'
  const gatewaysLabel  = globalMode ? '🌐 Mercury · Kast (USDT)' : '🏦 Banco Inter (PIX)'

  return (
    <div className="space-y-6">
      {/* Banner identificador modo GLOBAL */}
      {globalMode && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 flex items-center gap-3">
          <span className="text-2xl">🌐</span>
          <div>
            <p className="text-sm font-bold text-blue-300">Venda Rápida Global — Internacional</p>
            <p className="text-xs text-zinc-500">Gateways ativos: {gatewaysLabel} · Faturamento exibido em USD (taxa ref. {USD_DISPLAY_RATE})</p>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard icon={<TrendingUp className="w-5 h-5 text-emerald-500" />} label={globalMode ? 'Faturamento (USD)' : 'Faturamento'} value={revenueLabel} />
        <KpiCard icon={<CheckCircle2 className="w-5 h-5 text-blue-500" />} label="Vendas aprovadas" value={String(totalPaid)} />
        <KpiCard icon={<Clock className="w-5 h-5 text-amber-500" />} label={checkoutsLabel} value={String(totalCheckouts)} />
      </div>

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-lg">Links de Venda Rápida</h2>
          <p className="text-zinc-500 text-sm">Gere links públicos de checkout e acompanhe as vendas</p>
        </div>
        <button
          onClick={() => openCreateModal()}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition"
        >
          <Plus className="w-4 h-4" />
          Novo Link
        </button>
      </div>

      {showSecurityPanel ? <QuickSaleSecurityPanel /> : null}

      {generatedLink ? (
        <section className="border border-emerald-500/30 rounded-2xl p-4 bg-emerald-500/5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-emerald-300">Link pronto para enviar ao cliente</p>
              <p className="text-xs text-zinc-400 mt-0.5">{generatedLinkTitle || 'Venda Rápida'}</p>
            </div>
            <button
              type="button"
              className="text-zinc-400 hover:text-white text-xs"
              onClick={() => setGeneratedLink('')}
            >
              fechar
            </button>
          </div>
          <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-2">
            <p className="text-xs text-zinc-300 break-all">{generatedLink}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyGeneratedLink}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium"
            >
              <Copy className="w-3.5 h-3.5 inline mr-1" />
              {generatedLinkCopied ? 'Link copiado!' : 'Copiar link'}
            </button>
            <a
              href={generatedLink}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5 inline mr-1" />
              Abrir checkout
            </a>
            <button
              type="button"
              onClick={() => {
                const msg = `Segue seu link seguro para pagamento:\n${generatedLink}`
                window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
              }}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
            >
              <MessageCircle className="w-3.5 h-3.5 inline mr-1" />
              Enviar no WhatsApp
            </button>
          </div>
        </section>
      ) : null}

      {/* ── CARRINHO MULTI-PRODUTO ──────────────────────────────────────────── */}
      <section className="border border-blue-500/20 rounded-2xl p-5 space-y-4 bg-blue-500/5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-white flex items-center gap-2">
              🛒 Carrinho de Compras
              {cartItems.length > 0 && (
                <span className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-semibold">
                  {cartItems.length} produto{cartItems.length > 1 ? 's' : ''}
                </span>
              )}
            </h3>
            <p className="text-zinc-500 text-sm">Adicione múltiplos produtos e gere 1 PIX único com o valor total.</p>
          </div>
          {cartItems.length > 0 && (
            <button
              type="button"
              onClick={() => { setCartItems([]); setCartResult(null); setCartError(null) }}
              className="text-xs text-zinc-500 hover:text-red-400 transition"
            >
              Limpar
            </button>
          )}
        </div>

        {cartItems.length === 0 ? (
          <p className="text-sm text-zinc-600 text-center py-4">
            Clique em <strong className="text-zinc-400">+ Carrinho</strong> em qualquer produto abaixo para adicionar.
          </p>
        ) : (
          <>
            {/* Itens do carrinho */}
            <div className="space-y-2">
              {cartItems.map((item) => (
                <div key={item.listingId} className="flex items-center gap-3 rounded-xl bg-zinc-800/50 border border-zinc-700 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{item.title}</p>
                    <p className="text-xs text-zinc-500">R$ {item.unitPrice.toFixed(2)}/un · {item.available} disponível</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={() => updateCartQty(item.listingId, item.qty - 1)} className="w-6 h-6 rounded-md bg-zinc-700 text-zinc-200 text-xs font-bold hover:bg-zinc-600 transition flex items-center justify-center">−</button>
                    <span className="text-white text-sm font-bold w-5 text-center">{item.qty}</span>
                    <button type="button" onClick={() => updateCartQty(item.listingId, item.qty + 1)} disabled={item.qty >= item.available} className="w-6 h-6 rounded-md bg-zinc-700 text-zinc-200 text-xs font-bold hover:bg-zinc-600 transition flex items-center justify-center disabled:opacity-40">+</button>
                    <span className="text-emerald-400 font-semibold text-sm w-20 text-right">
                      R$ {(item.unitPrice * item.qty).toFixed(2)}
                    </span>
                    <button type="button" onClick={() => removeFromCart(item.listingId)} className="text-zinc-600 hover:text-red-400 transition">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desconto e total */}
            <div className="rounded-xl bg-zinc-900/60 border border-zinc-700 p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Subtotal</span>
                <span className="text-white font-semibold">R$ {cartSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-400 shrink-0">Desconto (R$)</label>
                <input
                  type="number" min="0" step="0.01"
                  className="input-dark text-xs h-7 flex-1"
                  placeholder="0.00"
                  value={cartDesconto}
                  onChange={(e) => setCartDesconto(e.target.value)}
                />
              </div>
              {cartDescontoNum > 0 && (
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>Desconto aplicado</span>
                  <span className="text-red-400">− R$ {cartDescontoNum.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-zinc-700 pt-2">
                <span className="font-bold text-white">Total a pagar</span>
                <span className="font-black text-emerald-400 text-lg">R$ {cartTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Formulário do comprador */}
            <form onSubmit={handleCartCheckout} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Field label="Nome do cliente">
                  <input required className="input-dark" placeholder="Nome completo" value={cartBuyerName} onChange={(e) => setCartBuyerName(e.target.value)} />
                </Field>
                <Field label="WhatsApp">
                  <input required className="input-dark" placeholder="(11) 99999-9999" value={cartBuyerWhatsapp} onChange={(e) => setCartBuyerWhatsapp(formatPhone(e.target.value))} />
                </Field>
                <Field label="E-mail (opcional)">
                  <input className="input-dark" placeholder="cliente@email.com" value={cartBuyerEmail} onChange={(e) => setCartBuyerEmail(e.target.value)} />
                </Field>
                <Field label="Tipo de documento">
                  <div className="flex gap-2">
                    {(['cpf', 'cnpj'] as const).map((t) => (
                      <button key={t} type="button"
                        onClick={() => { setCartDocType(t); setCartDoc('') }}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition ${cartDocType === t ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}
                      >
                        {t.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label={cartDocType === 'cnpj' ? 'CNPJ' : 'CPF'}>
                  <input required className="input-dark" placeholder={cartDocType === 'cnpj' ? '00.000.000/0001-00' : '000.000.000-00'}
                    value={cartDoc}
                    onChange={(e) => setCartDoc(cartDocType === 'cnpj' ? formatCnpj(e.target.value) : formatCpf(e.target.value))}
                  />
                </Field>
                <Field label="Obs. interna (opcional)">
                  <input className="input-dark" placeholder="Ex: negociado via WhatsApp..." value={cartNote} onChange={(e) => setCartNote(e.target.value)} />
                </Field>
              </div>

              {cartError && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">{cartError}</p>
              )}

              <button type="submit" disabled={cartLoading || cartItems.length === 0}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition disabled:opacity-50"
              >
                {cartLoading ? 'Gerando PIX...' : `🛒 Gerar PIX — R$ ${cartTotal.toFixed(2)}`}
              </button>
            </form>
          </>
        )}

        {/* Resultado do carrinho */}
        {cartResult && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-emerald-300">PIX gerado com sucesso!</p>
                {cartResult.orderNumber && <p className="text-xs text-zinc-400">Pedido {cartResult.orderNumber}</p>}
              </div>
              <p className="text-xl font-black text-white">R$ {cartResult.totalAmount.toFixed(2)}</p>
            </div>
            <div className="space-y-1 text-xs text-zinc-400">
              {cartResult.lineItems.map((li, i) => (
                <div key={i} className="flex justify-between">
                  <span>{li.qty}x {li.title}</span>
                  <span className="text-zinc-300">R$ {li.lineTotal.toFixed(2)}</span>
                </div>
              ))}
              {cartResult.desconto > 0 && (
                <div className="flex justify-between text-red-400"><span>Desconto</span><span>− R$ {cartResult.desconto.toFixed(2)}</span></div>
              )}
            </div>
            <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-2">
              <p className="text-[10px] text-zinc-500 mb-1">PIX Copia e Cola</p>
              <p className="text-xs font-mono text-zinc-200 break-all">{cartResult.pixCopyPaste}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copyCartPix}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium"
              >
                <Copy className="w-3.5 h-3.5" />
                {cartCopied ? 'Copiado!' : 'Copiar PIX'}
              </button>
              <a href={cartResult.resumeUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
              >
                <QrCode className="w-3.5 h-3.5" /> Ver checkout
              </a>
              <button type="button" onClick={sendCartWhatsapp}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
              >
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Teste rápido de PIX integrado (produto único) */}
      <section className="border border-zinc-800 rounded-2xl p-5 space-y-4 bg-zinc-900/40">
        <div>
          <h3 className="font-bold text-white">Gerar PIX — Produto único</h3>
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
                {filteredListings.map((l) => (
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
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="font-semibold text-emerald-300">PIX gerado com sucesso</p>
                {pixResult.orderNumber && (
                  <p className="text-xs font-bold text-white mt-0.5">
                    Pedido <span className="text-emerald-400">{pixResult.orderNumber}</span>
                  </p>
                )}
              </div>
              <span className="text-xs text-zinc-500">TXID: {pixResult.txid.slice(0, 12)}...</span>
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
          <div className={`bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-h-[90vh] p-5 sm:p-6 space-y-4 flex flex-col ${
            createStep === 3 ? 'max-w-4xl' : 'max-w-xl'
          }`}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-lg">Criar Link de Venda</h3>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-zinc-500">Fluxo guiado em 3 etapas para acelerar o lançamento sem perder qualidade.</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { step: 1 as const, title: 'Estoque' },
                { step: 2 as const, title: 'Copy' },
                { step: 3 as const, title: 'Checkout' },
              ].map((item) => (
                <button
                  key={item.step}
                  type="button"
                  onClick={() => {
                    if (item.step < createStep) setCreateStep(item.step)
                  }}
                  className={`rounded-lg border px-2 py-2 text-left transition ${
                    createStep === item.step
                      ? 'border-emerald-500/50 bg-emerald-500/10'
                      : createStep > item.step
                        ? 'border-zinc-700 bg-zinc-800/60'
                        : 'border-zinc-800 bg-zinc-950/40'
                  }`}
                >
                  <p className="text-[10px] text-zinc-400 uppercase tracking-wide">Etapa {item.step}</p>
                  <p className="text-xs font-semibold text-white">{item.title}</p>
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${wizardProgressPct}%` }}
                />
              </div>
              <p className="text-[11px] text-zinc-400 text-right">Progresso do lançamento: {wizardProgressPct}%</p>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 overflow-y-auto pr-1 max-h-[68vh]">
              {createStep === 1 ? (
                <section className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 space-y-3">
                <h4 className="text-sm font-semibold text-white">1) Produto da base de dados / estoque</h4>
                <p className="text-xs text-zinc-500">
                  Etapa obrigatória: selecione no autocomplete para vincular estoque real no checkout.
                </p>
                <Field label="Buscar no estoque por código ou nome">
                  <div ref={stockSearchWrapRef} className="relative">
                    <input
                      value={stockSearch}
                      onChange={(e) => {
                        setStockSearch(e.target.value)
                        setStockSearchOpen(true)
                        setSelectedStockInfo(null)
                      }}
                      onFocus={() => setStockSearchOpen(true)}
                      onKeyDown={handleStockSearchKeyDown}
                    placeholder="Digite código ou nome do produto..."
                      className="input-dark"
                    />
                    {stockSearchOpen && stockSearch.trim().length >= 1 ? (
                      <div
                        ref={stockDropdownRef}
                        className="absolute z-20 mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl max-h-64 overflow-auto"
                      >
                        {stockSearching ? (
                          <p className="px-3 py-2 text-xs text-zinc-400">Buscando na base de dados...</p>
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
                                <div className="flex flex-col items-end gap-1">
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                    item.isAvailable
                                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                      : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                                  }`}>
                                    {item.isAvailable ? 'Disponível agora' : 'Sem disponibilidade imediata'}
                                  </span>
                                  <span className="text-[10px] text-zinc-400">
                                    Cat.: {item.availableInCategory} · Nome disp.: {item.availableForName} · Base: {item.totalInBaseForName}
                                  </span>
                                </div>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                </Field>
                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={stockOnlyAvailable}
                    onChange={(e) => setStockOnlyAvailable(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  Mostrar somente produtos com estoque disponível agora
                </label>
                {selectedStockInfo ? (
                  <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-2 text-xs text-zinc-300">
                    <p>Produto selecionado: <span className="text-white font-medium">{selectedStockInfo.adsId}</span> · {selectedStockInfo.displayName}</p>
                    <p className="text-zinc-400 mt-1">Categoria: {selectedStockInfo.category.replace('_', ' ')} · Disponível agora: {selectedStockInfo.isAvailable ? 'SIM' : 'NÃO'}</p>
                    <p className="text-zinc-500 mt-1">
                      Copy, preço e estoque inicial do link foram preenchidos automaticamente com base no produto selecionado.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setStockQty(String(getSuggestedLinkStock(selectedStockInfo)))}
                        className="px-2 py-1 rounded-md border border-zinc-600 text-zinc-200 hover:bg-zinc-800 transition"
                      >
                        Usar estoque sugerido da base
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowEstoqueRapido(true)}
                        className="px-2 py-1 rounded-md border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 transition"
                      >
                        + Adicionar mais estoque
                      </button>
                    </div>
                  </div>
                ) : (
                  <QuickAddStock
                    category={category}
                    onAdded={(sug) => {
                      applyStockSuggestion(sug)
                      setStockSearchOpen(false)
                    }}
                  />
                )}
                {!isStep1Valid ? (
                  <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-2">
                    Campo obrigatório: escolha um produto no autocomplete para continuar.
                  </p>
                ) : null}

                {/* ── Colar e Vender ─────────────────────────────────────────── */}
                <div className="border-t border-zinc-800 pt-3 space-y-3">
                  <button
                    type="button"
                    onClick={() => { setShowColarVender(!showColarVender); setColarMsg(null); setColarParsed(null) }}
                    className="flex items-center gap-2 text-xs font-semibold text-blue-400 hover:text-blue-300 transition"
                  >
                    <Clipboard className="w-3.5 h-3.5" />
                    📋 Colar dados do fornecedor e vender na hora
                  </button>

                  {showColarVender && (
                    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 space-y-3">
                      <p className="text-[11px] text-zinc-400">
                        Cole qualquer texto do fornecedor — o sistema extrai nome, gasto, safra, ID e preço automaticamente.
                      </p>
                      <p className="text-[10px] text-zinc-600">
                        Exemplo: <span className="text-zinc-400">ID: 863-498-6283 Gasto: 238k Nicho: Imobiliaria Ano: 2012 Pag: Manual Preço: 350</span>
                      </p>
                      <textarea
                        className="input-dark text-xs w-full resize-none h-20 font-mono"
                        placeholder="Cole aqui o texto do fornecedor ou as infos do produto..."
                        value={colarTexto}
                        onChange={(e) => {
                          setColarTexto(e.target.value)
                          setColarParsed(null)
                          setColarMsg(null)
                        }}
                      />
                      <button
                        type="button"
                        disabled={!colarTexto.trim()}
                        onClick={() => parseColarTexto(colarTexto)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs font-semibold hover:bg-blue-600/30 transition disabled:opacity-40"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        Analisar texto
                      </button>

                      {colarParsed && (
                        <div className="space-y-2 border-t border-zinc-700 pt-2">
                          <p className="text-[11px] text-emerald-400 font-semibold">✅ Dados extraídos — revise e confirme:</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="col-span-2">
                              <label className="block text-[11px] text-zinc-400 mb-1">Nome do produto</label>
                              <input
                                required
                                className="input-dark text-xs w-full"
                                value={colarParsed.displayName}
                                onChange={(e) => setColarParsed({ ...colarParsed, displayName: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-zinc-400 mb-1">Preço de venda (R$)</label>
                              <input
                                required
                                type="number"
                                min="1"
                                step="0.01"
                                className="input-dark text-xs w-full"
                                placeholder="150.00"
                                value={colarParsed.salePrice}
                                onChange={(e) => setColarParsed({ ...colarParsed, salePrice: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-zinc-400 mb-1">Quantidade</label>
                              <input
                                required
                                type="number"
                                min="1"
                                max="500"
                                className="input-dark text-xs w-full"
                                value={colarParsed.qty}
                                onChange={(e) => setColarParsed({ ...colarParsed, qty: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-zinc-400 mb-1">Plataforma</label>
                              <select
                                className="input-dark text-xs w-full"
                                value={colarParsed.category}
                                onChange={(e) => setColarParsed({ ...colarParsed, category: e.target.value })}
                              >
                                {ASSET_CATEGORIES.map((c) => (
                                  <option key={c} value={c}>{c.replace('_', ' ')}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] text-zinc-400 mb-1">Código/ID</label>
                              <input
                                className="input-dark text-xs w-full"
                                placeholder="ID original"
                                value={colarParsed.productCode}
                                onChange={(e) => setColarParsed({ ...colarParsed, productCode: e.target.value })}
                              />
                            </div>
                            {colarParsed.notes && (
                              <div className="col-span-2">
                                <label className="block text-[11px] text-zinc-400 mb-1">Notas extraídas</label>
                                <input
                                  className="input-dark text-xs w-full"
                                  value={colarParsed.notes}
                                  onChange={(e) => setColarParsed({ ...colarParsed, notes: e.target.value })}
                                />
                              </div>
                            )}
                          </div>
                          {colarMsg && (
                            <p className={`text-[11px] rounded-lg px-2 py-1.5 ${
                              colarMsg.type === 'ok'
                                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                                : 'bg-red-500/10 text-red-300 border border-red-500/20'
                            }`}>
                              {colarMsg.text}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleColarVender()}
                            disabled={colarSaving || !colarParsed.salePrice}
                            className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            <Zap className="w-3.5 h-3.5" />
                            {colarSaving ? 'Salvando no banco...' : `Adicionar ${colarParsed.qty || 1} unidade(s) e continuar →`}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Estoque Rápido ─────────────────────────────────────────── */}
                <div className="border-t border-zinc-800 pt-3">
                  <button
                    type="button"
                    onClick={() => { setShowEstoqueRapido(!showEstoqueRapido); setEstoqueRapidoMsg(null) }}
                    className="flex items-center gap-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition"
                  >
                    <span className="text-base leading-none">{showEstoqueRapido ? '▲' : '▼'}</span>
                    ⚡ Adicionar estoque rápido (sem sair desta tela)
                  </button>

                  {showEstoqueRapido && (
                    <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
                      <p className="text-[11px] text-zinc-400">
                        Adiciona unidades direto ao banco · Categoria selecionada: <strong className="text-white">{category.replace('_', ' ')}</strong>
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                          <label className="block text-[11px] text-zinc-400 mb-1">Nome do produto *</label>
                          <input
                            required
                            className="input-dark text-xs w-full"
                            placeholder="Ex: Google Ads Verificada Premium"
                            value={estoqueRapidoForm.displayName}
                            onChange={(e) => setEstoqueRapidoForm({ ...estoqueRapidoForm, displayName: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-400 mb-1">Preço de venda (R$) *</label>
                          <input
                            required
                            type="number"
                            min="1"
                            step="0.01"
                            className="input-dark text-xs w-full"
                            placeholder="150.00"
                            value={estoqueRapidoForm.salePrice}
                            onChange={(e) => setEstoqueRapidoForm({ ...estoqueRapidoForm, salePrice: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-400 mb-1">Quantidade *</label>
                          <input
                            required
                            type="number"
                            min="1"
                            max="500"
                            className="input-dark text-xs w-full"
                            placeholder="1"
                            value={estoqueRapidoForm.qty}
                            onChange={(e) => setEstoqueRapidoForm({ ...estoqueRapidoForm, qty: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-400 mb-1">Código (opcional)</label>
                          <input
                            className="input-dark text-xs w-full"
                            placeholder="Ex: AA-CONT-000001"
                            value={estoqueRapidoForm.productCode}
                            onChange={(e) => setEstoqueRapidoForm({ ...estoqueRapidoForm, productCode: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-400 mb-1">Notas internas</label>
                          <input
                            className="input-dark text-xs w-full"
                            placeholder="Ex: Safra 2022, proxy dedicado..."
                            value={estoqueRapidoForm.notes}
                            onChange={(e) => setEstoqueRapidoForm({ ...estoqueRapidoForm, notes: e.target.value })}
                          />
                        </div>
                      </div>
                      {estoqueRapidoMsg && (
                        <p className={`text-[11px] rounded-lg px-2 py-1.5 ${
                          estoqueRapidoMsg.type === 'ok'
                            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-300 border border-red-500/20'
                        }`}>
                          {estoqueRapidoMsg.text}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleEstoqueRapido()}
                        disabled={estoqueRapidoSaving}
                        className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition disabled:opacity-50"
                      >
                        {estoqueRapidoSaving
                          ? 'Adicionando ao banco...'
                          : `Adicionar ${Number(estoqueRapidoForm.qty) || 1} unidade(s) ao estoque`
                        }
                      </button>
                    </div>
                  )}
                </div>
                </section>
              ) : null}

              {createStep === 2 ? (
                <section className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 space-y-3">
                <h4 className="text-sm font-semibold text-white">2) Copy comercial (copiar e colar)</h4>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                  <p className="text-xs text-emerald-200">
                    Ao selecionar o produto do estoque, nome e copy comercial já são carregados automaticamente.
                  </p>
                </div>
                <Field label="Nome do produto para o cliente">
                  <input
                    required value={title} onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: TikTok Verificada, Google Ads Premium"
                    className="input-dark"
                  />
                </Field>
                {!isStep2Valid ? (
                  <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-2">
                    Título comercial obrigatório com pelo menos 3 caracteres.
                  </p>
                ) : null}
                {copyAutoFilledFromStock ? (
                  <p className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1">
                    Copy preenchida automaticamente com base no produto do estoque selecionado.
                  </p>
                ) : null}
                <Field label="Subtítulo (opcional)">
                  <textarea
                    value={subtitle} onChange={(e) => setSubtitle(e.target.value)}
                    rows={2}
                    placeholder="Resumo rápido do produto para o card"
                    className="input-dark"
                  />
                </Field>
                <Field label="Descrição completa (copiar e colar)">
                  <textarea
                    value={fullDescription} onChange={(e) => setFullDescription(e.target.value)}
                    rows={4}
                    placeholder={`Ex:\n✅ Verificado no Developers\n✅ Ano de Criação: 2018 a 2022\n✅ 2FA + Cookies`}
                    className="input-dark"
                  />
                </Field>
                </section>
              ) : null}

              {createStep === 3 ? (
                <section className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 space-y-3">
                  <h4 className="text-sm font-semibold text-white">3) Configuração da venda e geração do link</h4>
                  <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-4">
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field label="Código do produto no estoque (manual)">
                          <input
                            value={stockProductCode}
                            onChange={(e) => setStockProductCode(e.target.value.toUpperCase())}
                            placeholder="AA-CONT-000001"
                            className="input-dark"
                          />
                        </Field>
                        <Field label="Nome do produto no estoque (manual)">
                          <input
                            value={stockProductName}
                            onChange={(e) => setStockProductName(e.target.value)}
                            placeholder="Perfil Real Verificado"
                            className="input-dark"
                          />
                        </Field>
                      </div>
                      <p className="text-xs text-zinc-500">
                        Esses campos já são preenchidos automaticamente ao selecionar item da base acima.
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
                          {!isPriceValid ? (
                            <p className="mt-1 text-[11px] text-red-300">Informe um preço válido maior que zero.</p>
                          ) : null}
                        </Field>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Máx. unidades por pedido">
                          <input
                            type="number" min="1" max="100"
                            value={maxQty} onChange={(e) => setMaxQty(e.target.value)}
                            className="input-dark"
                          />
                          {!isMaxQtyValid ? (
                            <p className="mt-1 text-[11px] text-red-300">Máximo por pedido deve ser 1 ou mais.</p>
                          ) : null}
                        </Field>
                        <Field label="Estoque inicial para o link (quantidade)">
                          <input
                            type="number" min="1" max="100000"
                            value={stockQty} onChange={(e) => setStockQty(e.target.value)}
                            className="input-dark"
                          />
                          {!isStockQtyValid ? (
                            <p className="mt-1 text-[11px] text-red-300">Estoque inicial do link deve ser 1 ou mais.</p>
                          ) : null}
                        </Field>
                      </div>
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 space-y-3">
                        <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-300">Modo de pagamento do link</h5>
                        {fixedMode ? (
                          <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2">
                            <p className="text-sm font-medium text-white">
                              {effectivePaymentMode === 'GLOBAL' ? 'Venda rápida Global' : 'Venda rápida PIX (Brasil)'}
                            </p>
                            <p className="text-xs text-zinc-400">
                              Este menu está fixado para o modo {effectivePaymentMode}.
                            </p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <label className={`rounded-lg border px-3 py-2 cursor-pointer transition ${
                              paymentMode === 'PIX'
                                ? 'border-emerald-500/50 bg-emerald-500/10'
                                : 'border-zinc-700 bg-zinc-900/60'
                            }`}>
                              <input
                                type="radio"
                                name="paymentMode"
                                checked={paymentMode === 'PIX'}
                                onChange={() => setPaymentMode('PIX')}
                                className="sr-only"
                              />
                              <p className="text-sm font-medium text-white">Venda rápida PIX (Brasil)</p>
                              <p className="text-xs text-zinc-400">Mantém o checkout padrão com PIX Inter.</p>
                            </label>
                            <label className={`rounded-lg border px-3 py-2 cursor-pointer transition ${
                              paymentMode === 'GLOBAL'
                                ? 'border-emerald-500/50 bg-emerald-500/10'
                                : 'border-zinc-700 bg-zinc-900/60'
                            }`}>
                              <input
                                type="radio"
                                name="paymentMode"
                                checked={paymentMode === 'GLOBAL'}
                                onChange={() => setPaymentMode('GLOBAL')}
                                className="sr-only"
                              />
                              <p className="text-sm font-medium text-white">Venda rápida Global</p>
                              <p className="text-xs text-zinc-400">Checkout separado com Kast e/ou Mercury.</p>
                            </label>
                          </div>
                        )}

                        {effectivePaymentMode === 'GLOBAL' ? (
                          <div className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-900/60 p-3">
                            <p className="text-xs text-zinc-300">Gateways habilitados para o link global:</p>
                            <label className="flex items-center gap-2 text-sm text-zinc-200">
                              <input
                                type="checkbox"
                                checked={globalGatewayKast}
                                onChange={(e) => setGlobalGatewayKast(e.target.checked)}
                                className="accent-emerald-500"
                              />
                              Kast (cripto)
                            </label>
                            <label className="flex items-center gap-2 text-sm text-zinc-200">
                              <input
                                type="checkbox"
                                checked={globalGatewayMercury}
                                onChange={(e) => setGlobalGatewayMercury(e.target.checked)}
                                className="accent-emerald-500"
                              />
                              Mercury (wire USD)
                            </label>
                            {!globalGatewayKast && !globalGatewayMercury ? (
                              <p className="text-xs text-amber-300">
                                Selecione pelo menos um gateway global para gerar o link.
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Badge (topo da página)">
                          <input
                            value={badge} onChange={(e) => setBadge(e.target.value)}
                            placeholder="ENTREGA AUTOMÁTICA"
                            className="input-dark"
                          />
                        </Field>
                      </div>
                    </div>

                    <aside className="lg:sticky lg:top-2 h-fit rounded-xl border border-zinc-700 bg-zinc-900/70 p-3 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Resumo lateral do checkout</p>
                      <div className="space-y-1 text-xs">
                        <p className="text-zinc-400">Produto</p>
                        <p className="text-zinc-100 font-medium break-words">{summaryProductName}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-2">
                          <p className="text-zinc-500">Preço/un</p>
                          <p className="text-zinc-100 font-semibold">{summaryPriceLabel}</p>
                        </div>
                        <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-2">
                          <p className="text-zinc-500">Máx pedido</p>
                          <p className="text-zinc-100 font-semibold">{summaryMaxQtyLabel}</p>
                        </div>
                        <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-2">
                          <p className="text-zinc-500">Estoque link</p>
                          <p className="text-zinc-100 font-semibold">{summaryStockQtyLabel}</p>
                        </div>
                        <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-2">
                          <p className="text-zinc-500">Ticket máx/pedido</p>
                          <p className="text-zinc-100 font-semibold">{summaryPotentialMaxValueLabel}</p>
                        </div>
                      </div>
                      <div className="text-xs space-y-1">
                        <p className="text-zinc-500">Modo</p>
                        <p className="text-zinc-200">{summaryModeLabel}</p>
                        {effectivePaymentMode === 'GLOBAL' ? (
                          <p className="text-zinc-400">
                            Gateways: {selectedGlobalGateways.length > 0 ? selectedGlobalGateways.join(' · ') : 'Pendente'}
                          </p>
                        ) : (
                          <p className="text-zinc-400">Gateway: PIX Inter</p>
                        )}
                      </div>
                      <div className="text-xs space-y-1">
                        <p className="text-zinc-500">Vínculo de estoque</p>
                        <p className="text-zinc-200 break-words">{summaryStockCode}</p>
                        <p className="text-zinc-400 break-words">{summaryStockName}</p>
                      </div>
                      <div className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-950/70 p-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-200">Comissão estimada</p>
                        <div>
                          <label className="text-[11px] text-zinc-400">Comissão do vendedor (%)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={commissionPct}
                            onChange={(e) => setCommissionPct(e.target.value)}
                            className="input-dark mt-1 h-8 text-xs"
                          />
                          {!isCommissionPctValid ? (
                            <p className="mt-1 text-[11px] text-red-300">Use um percentual entre 0 e 100.</p>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-2">
                            <p className="text-zinc-500">Comissão/un</p>
                            <p className="text-zinc-100 font-semibold">
                              {estimatedCommissionPerUnit != null ? formatBrl(estimatedCommissionPerUnit) : 'Pendente'}
                            </p>
                          </div>
                          <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-2">
                            <p className="text-zinc-500">Comissão pedido</p>
                            <p className="text-zinc-100 font-semibold">
                              {estimatedCommissionPerOrder != null ? formatBrl(estimatedCommissionPerOrder) : 'Pendente'}
                            </p>
                          </div>
                          <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-2">
                            <p className="text-zinc-500">Líquido/un</p>
                            <p className="text-zinc-100 font-semibold">
                              {estimatedNetPerUnit != null ? formatBrl(estimatedNetPerUnit) : 'Pendente'}
                            </p>
                          </div>
                          <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-2">
                            <p className="text-zinc-500">Líquido pedido</p>
                            <p className="text-zinc-100 font-semibold">
                              {estimatedNetPerOrder != null ? formatBrl(estimatedNetPerOrder) : 'Pendente'}
                            </p>
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400">Custo base estimado / unidade (opcional)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={estimatedUnitCost}
                            onChange={(e) => setEstimatedUnitCost(e.target.value)}
                            placeholder="Ex.: 120.00"
                            className="input-dark mt-1 h-8 text-xs"
                          />
                          {!isEstimatedUnitCostValid ? (
                            <p className="mt-1 text-[11px] text-red-300">Informe um custo válido igual ou maior que zero.</p>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-2">
                            <p className="text-zinc-500">Margem/un</p>
                            <p className={`font-semibold ${isEstimatedMarginNegative ? 'text-red-300' : 'text-zinc-100'}`}>
                              {estimatedMarginPerUnit != null ? formatBrl(estimatedMarginPerUnit) : 'Informe custo base'}
                            </p>
                          </div>
                          <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-2">
                            <p className="text-zinc-500">Margem %</p>
                            <p className={`font-semibold ${isEstimatedMarginNegative ? 'text-red-300' : 'text-zinc-100'}`}>
                              {estimatedMarginPct != null ? `${estimatedMarginPct.toFixed(1)}%` : 'Informe custo base'}
                            </p>
                          </div>
                        </div>
                        <p className="text-[11px] text-zinc-400">
                          Margem pedido: {estimatedMarginPerOrder != null ? formatBrl(estimatedMarginPerOrder) : 'Informe custo base'}
                        </p>
                      </div>
                      <div className={`rounded-lg border px-2 py-1.5 text-[11px] ${
                        canSubmitCreateStepThree
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                      }`}>
                        {canSubmitCreateStepThree
                          ? 'Pronto para criar o link com segurança.'
                          : 'Complete os campos obrigatórios para habilitar a criação do link.'}
                      </div>
                    </aside>
                  </div>
                </section>
              ) : null}

              {createStep === 3 ? (
                <section className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-200">Prévia do link antes de salvar</p>
                  <p className="text-xs text-zinc-300">
                    Produto: <span className="font-medium text-white">{title.trim() || 'Seu produto'}</span>
                  </p>
                  <p className="text-xs text-zinc-400 break-all">
                    {createPreviewUrl || 'Preencha um título para visualizar a prévia.'}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    Observação: após salvar, o sistema gera o checkout efêmero final com token seguro.
                  </p>
                </section>
              ) : null}

              <div className="flex gap-3 pt-2 sticky bottom-0 bg-zinc-900/95 backdrop-blur-sm pb-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setCreateStep(1)
                  }}
                  className="flex-1 py-3 rounded-xl border border-zinc-700 text-zinc-400 text-sm hover:text-white transition"
                >
                  Cancelar
                </button>
                {createStep > 1 ? (
                  <button
                    type="button"
                    onClick={() => setCreateStep((prev) => (prev === 3 ? 2 : 1))}
                    className="flex-1 py-3 rounded-xl border border-zinc-700 text-zinc-200 text-sm hover:text-white transition"
                  >
                    Voltar
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={
                    saving ||
                    (createStep === 1 && !isStep1Valid) ||
                    (createStep === 2 && !isStep2Valid) ||
                    (createStep === 3 && !canSubmitCreateStepThree)
                  }
                  className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition disabled:opacity-50"
                >
                  {createStep < 3 ? `Continuar (${wizardProgressPct}%)` : saving ? 'Criando...' : 'Criar Link'}
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
      ) : filteredListings.length === 0 ? (
        <div className="border border-zinc-800 rounded-2xl p-8 bg-zinc-900/40">
          <div className="max-w-2xl mx-auto text-center space-y-4">
            <p className="text-4xl">🚀</p>
            <p className="text-xl font-semibold text-white">Comece sua operação de Venda Rápida agora</p>
            <p className="text-sm text-zinc-400">
              Crie o primeiro link em menos de 1 minuto com estoque vinculado, copy automática e checkout pronto para WhatsApp.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              {(fixedMode === null || fixedMode === 'PIX') ? (
                <button
                  type="button"
                  onClick={() => openCreateModal('PIX')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition"
                >
                  <Plus className="w-4 h-4" />
                  Criar link PIX
                </button>
              ) : null}
              {(fixedMode === null || fixedMode === 'GLOBAL') ? (
                <button
                  type="button"
                  onClick={() => openCreateModal('GLOBAL')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 text-blue-200 text-sm font-semibold transition"
                >
                  <Plus className="w-4 h-4" />
                  Criar link Global
                </button>
              ) : null}
            </div>
            <p className="text-xs text-zinc-500">
              Dica: selecione o produto da base para preencher copy, preço e estoque automaticamente.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredListings.map((l, idx) => {
            const listingMode = l.paymentMode ?? 'PIX'
            const url = listingMode === 'GLOBAL'
              ? buildPublicGlobalCheckoutUrl(l.slug)
              : buildPublicCheckoutUrl(l.slug)
            const seqNumber = String(idx + 1).padStart(3, '0')
            const isEditing = editingListingId === l.id
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
                      <span className="text-[10px] font-mono text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">
                        #{seqNumber}
                      </span>
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
                    <p className="text-zinc-600 text-xs mt-1">
                      {l.assetCategory.replace('_', ' ')} · {
                        l.paymentMode === 'GLOBAL'
                          ? `$ ${(l.pricePerUnit / USD_DISPLAY_RATE).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
                          : `R$ ${l.pricePerUnit.toFixed(2)}`
                      }/un · máx {l.maxQty} un
                    </p>
                    <p className="text-zinc-500 text-[11px] mt-1">
                      {l.paymentMode === 'GLOBAL'
                        ? `🌐 Global — ${(l.globalGateways?.length ? l.globalGateways : ['KAST', 'MERCURY']).map((g) => g === 'MERCURY' ? 'Mercury (USD)' : 'Kast (USDT)').join(' · ')}`
                        : '🏦 PIX Inter (BRL)'}
                    </p>
                    {l.paymentMode === 'GLOBAL' ? (
                      <p className="text-zinc-500 text-[11px]">
                        Gateways: {(l.globalGateways && l.globalGateways.length > 0 ? l.globalGateways : ['KAST', 'MERCURY']).join(' · ')}
                      </p>
                    ) : null}
                    {(l.stockProductCode || l.stockProductName) && (
                      <p className="text-zinc-500 text-[11px] mt-1">
                        Vínculo estoque: {l.stockProductCode || '—'} {l.stockProductName ? `· ${l.stockProductName}` : ''}
                      </p>
                    )}
                    {typeof l.stockQtyConfigured === 'number' ? (
                      <p className="text-zinc-500 text-[11px] mt-1">
                        Estoque configurado no link: {l.stockQtyConfigured}
                        {typeof l.stockQtyRemaining === 'number' ? ` · restante: ${l.stockQtyRemaining}` : ''}
                      </p>
                    ) : null}
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => syncListingStock(l)}
                        disabled={syncingStockListingId === l.id}
                        className="px-2 py-1 rounded-md border border-zinc-600 text-zinc-200 hover:bg-zinc-800 transition text-[11px] disabled:opacity-60"
                      >
                        {syncingStockListingId === l.id ? 'Sincronizando estoque...' : 'Sincronizar estoque do link com base atual'}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => isEditing ? setEditingListingId(null) : openEdit(l)}
                      title="Editar"
                      className={`p-2 rounded-lg transition ${isEditing ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
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

                {/* Stats + Adicionar ao carrinho */}
                <div className="flex items-center gap-2">
                  <div className="grid grid-cols-3 gap-3 flex-1">
                  <StatPill label="Disponível" value={`${l.available} un`} color="emerald" />
                  <StatPill label={listingMode === 'GLOBAL' ? 'Links gerados' : 'PIX gerados'} value={String(l.totalCheckouts)} color="blue" />
                  <StatPill
                    label="Faturado"
                    value={listingMode === 'GLOBAL'
                      ? `$ ${(l.revenue / USD_DISPLAY_RATE).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                      : `R$ ${l.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`
                    }
                    color="amber"
                  />
                  </div>
                  {l.available > 0 && listingMode === 'PIX' && (
                    <button
                      type="button"
                      onClick={() => { addToCart(l); setCartAddingId(l.id); setTimeout(() => setCartAddingId(''), 1200) }}
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition border ${
                        cartAddingId === l.id
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : cartItems.some((i) => i.listingId === l.id)
                          ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-300'
                      }`}
                    >
                      {cartAddingId === l.id ? '✓ Adicionado!' : cartItems.some((i) => i.listingId === l.id) ? '🛒 No carrinho' : '+ Carrinho'}
                    </button>
                  )}
                </div>

                {/* Edição inline */}
                {isEditing && (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
                    <p className="text-xs font-semibold text-emerald-300">Editar link #{seqNumber} — {l.title}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <label className="block text-[11px] text-zinc-400 mb-1">Título do produto</label>
                        <input
                          className="input-dark text-xs w-full"
                          value={editForm.title}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1">Preço por unidade (R$)</label>
                        <input
                          type="number" min="1" step="0.01"
                          className="input-dark text-xs w-full"
                          value={editForm.price}
                          onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1">Máx. por pedido</label>
                        <input
                          type="number" min="1" max="100"
                          className="input-dark text-xs w-full"
                          value={editForm.maxQty}
                          onChange={(e) => setEditForm({ ...editForm, maxQty: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1">Estoque do link (qtd)</label>
                        <input
                          type="number" min="1"
                          className="input-dark text-xs w-full"
                          value={editForm.stockQty}
                          onChange={(e) => setEditForm({ ...editForm, stockQty: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1">Badge</label>
                        <input
                          className="input-dark text-xs w-full"
                          placeholder="ENTREGA AUTOMÁTICA"
                          value={editForm.badge}
                          onChange={(e) => setEditForm({ ...editForm, badge: e.target.value })}
                        />
                      </div>
                    </div>
                    {editError && (
                      <p className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1">{editError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingListingId(null)}
                        className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-xs hover:text-white transition"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={editSaving}
                        onClick={() => saveEdit(l.id)}
                        className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition disabled:opacity-50"
                      >
                        {editSaving ? 'Salvando...' : 'Salvar alterações'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Link */}
                <div className="flex items-center gap-2 bg-zinc-800/50 border border-zinc-700 rounded-xl px-3 py-2">
                  <span className="text-zinc-400 text-xs font-mono flex-1 truncate">{url}</span>
                  <button
                    onClick={() => copyLink(l.slug, l.paymentMode)}
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

// ─── Componente inline de adição rápida de estoque ────────────────────────────

function QuickAddStock({
  category,
  onAdded,
}: {
  category: string
  onAdded: (sug: StockProductSuggestion) => void
}) {
  const [name, setName]     = useState('')
  const [qty, setQty]       = useState('1')
  const [price, setPrice]   = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const handleAdd = async () => {
    if (!name.trim()) { setMsg({ type: 'err', text: 'Informe o nome do produto.' }); return }
    if (!price || Number(price) <= 0) { setMsg({ type: 'err', text: 'Informe um preço válido.' }); return }

    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/estoque-rapido', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          displayName: name.trim(),
          salePrice:   Number(price),
          qty:         Math.max(1, Number(qty) || 1),
        }),
      })
      const data = await res.json().catch(() => ({})) as {
        ok?: boolean; qty?: number; message?: string; error?: string
        assets?: Array<{ adsId: string; displayName: string }>
      }

      if (!res.ok || !data.ok) {
        setMsg({ type: 'err', text: data.error ?? 'Erro ao adicionar.' })
        return
      }

      const qtdAdded = data.qty ?? 1
      const first = data.assets?.[0]
      setMsg({ type: 'ok', text: `✅ ${qtdAdded} unidade(s) de "${name.trim()}" adicionada(s) ao estoque! Produto selecionado automaticamente.` })

      if (first) {
        onAdded({
          assetId:             first.adsId,
          adsId:               first.adsId,
          displayName:         first.displayName,
          category,
          salePrice:           Number(price),
          isAvailable:         true,
          availableInCategory: qtdAdded,
          availableForName:    qtdAdded,
          totalInBaseForName:  qtdAdded,
        })
      }

      setName('')
      setQty('1')
      setPrice('')
    } finally {
      setSaving(false)
    }
  }

  // Usa div em vez de form para evitar submit aninhado no wizard
  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
      <div>
        <p className="text-xs font-semibold text-emerald-300">⚡ Adicionar produto ao estoque agora</p>
        <p className="text-[11px] text-zinc-500 mt-0.5">
          Preencha e clique em adicionar — o produto será gravado no banco e selecionado automaticamente.
        </p>
      </div>

      <div className="space-y-2">
        <div>
          <label className="block text-[11px] text-zinc-400 mb-1">Nome do produto *</label>
          <input
            className="input-dark w-full text-xs"
            placeholder="Ex: Google Ads Verificada Premium"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation() } }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] text-zinc-400 mb-1">Preço de venda (R$) *</label>
            <input
              type="number"
              min="1"
              step="0.01"
              className="input-dark w-full text-xs"
              placeholder="150.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation() } }}
            />
          </div>
          <div>
            <label className="block text-[11px] text-zinc-400 mb-1">Quantidade *</label>
            <input
              type="number"
              min="1"
              max="500"
              className="input-dark w-full text-xs"
              placeholder="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation() } }}
            />
          </div>
        </div>
      </div>

      {msg && (
        <p className={`text-[11px] rounded-lg px-2 py-1.5 ${
          msg.type === 'ok'
            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
            : 'bg-red-500/10 text-red-300 border border-red-500/20'
        }`}>
          {msg.text}
        </p>
      )}

      <button
        type="button"
        onClick={handleAdd}
        disabled={saving}
        className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving ? (
          <>
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Gravando no banco...
          </>
        ) : (
          `➕ Adicionar ${Number(qty) || 1} unidade(s) ao estoque`
        )}
      </button>
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
