'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { captureUtms, buildUtmPayload, type UtmData } from '@/lib/utm-tracker'

interface ProductInfo {
  id: string
  slug: string
  title: string
  subtitle: string | null
  fullDescription: string | null
  stockProductCode: string | null
  stockProductName: string | null
  badge: string | null
  pricePerUnit: number
  maxQty: number
  available: number
}

interface PixData {
  checkoutId: string
  orderNumber?: string | null
  txid: string
  pixCopyPaste: string
  qrCodeBase64: string
  expiresAt: string
  totalAmount: number
  qty: number
  title: string
}

type DeliveryFlowStatus =
  | 'PENDING_PAYMENT'
  | 'WAITING_CUSTOMER_DATA'
  | 'DELIVERY_REQUESTED'
  | 'DELIVERY_IN_PROGRESS'
  | 'DELIVERED'

interface DeliveryState {
  flowStatus: DeliveryFlowStatus
  adspowerEmail: string | null
  adspowerProfileReleased: boolean
  deliveryRequestedAt: string | null
  deliveryStatusNote: string | null
  deliverySent: boolean
  lastStatusAt?: string | null
}

interface CheckoutStatusResponse {
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED'
  orderNumber?: string | null
  updatedAt?: string | null
  paidAt?: string | null
  expiresAt?: string | null
  pixCopyPaste?: string | null
  qrCodeBase64?: string | null
  totalAmount?: number
  qty?: number
  title?: string | null
  delivery?: DeliveryState
}

type Step = 'form' | 'pix' | 'delivery' | 'error' | 'loading'
type DocType = 'cpf' | 'cnpj'

const DELIVERY_FLOW_LABELS: Record<DeliveryFlowStatus, { title: string; description: string; order: number }> = {
  PENDING_PAYMENT: {
    title: 'Aguardando pagamento',
    description: 'O PIX precisa ser aprovado para liberar a etapa de entrega.',
    order: 0,
  },
  WAITING_CUSTOMER_DATA: {
    title: 'Aguardando dados AdsPower',
    description: 'Preencha seu e-mail AdsPower e confirme que o perfil está liberado.',
    order: 1,
  },
  DELIVERY_REQUESTED: {
    title: 'Dados de entrega recebidos',
    description: 'Estamos validando seu perfil e separando a entrega.',
    order: 2,
  },
  DELIVERY_IN_PROGRESS: {
    title: 'Entrega em andamento',
    description: 'Equipe Ads Ativos está liberando o ativo.',
    order: 3,
  },
  DELIVERED: {
    title: 'Entrega concluída',
    description: 'Seu ativo já foi entregue.',
    order: 4,
  },
}

const DELIVERY_TIMELINE: DeliveryFlowStatus[] = [
  'WAITING_CUSTOMER_DATA',
  'DELIVERY_REQUESTED',
  'DELIVERY_IN_PROGRESS',
  'DELIVERED',
]

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
  if (d.length <= 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  return v
}

function normalizeEmail(v: string) {
  return v.trim().toLowerCase()
}

function getDefaultDeliveryState(status: CheckoutStatusResponse['status']): DeliveryState {
  const flowStatus: DeliveryFlowStatus = status === 'PAID' ? 'WAITING_CUSTOMER_DATA' : 'PENDING_PAYMENT'
  return {
    flowStatus,
    adspowerEmail: null,
    adspowerProfileReleased: false,
    deliveryRequestedAt: null,
    deliveryStatusNote: DELIVERY_FLOW_LABELS[flowStatus].description,
    deliverySent: false,
    lastStatusAt: null,
  }
}

function normalizeDeliveryState(
  raw: CheckoutStatusResponse['delivery'] | undefined,
  status: CheckoutStatusResponse['status'],
  checkoutUpdatedAt?: string | null,
): DeliveryState {
  if (!raw) return getDefaultDeliveryState(status)
  const safeFlowStatus: DeliveryFlowStatus = raw.flowStatus in DELIVERY_FLOW_LABELS
    ? raw.flowStatus
    : getDefaultDeliveryState(status).flowStatus
  return {
    flowStatus: safeFlowStatus,
    adspowerEmail: raw.adspowerEmail ?? null,
    adspowerProfileReleased: Boolean(raw.adspowerProfileReleased),
    deliveryRequestedAt: raw.deliveryRequestedAt ?? null,
    deliveryStatusNote: raw.deliveryStatusNote ?? DELIVERY_FLOW_LABELS[safeFlowStatus].description,
    deliverySent: Boolean(raw.deliverySent),
    lastStatusAt: raw.lastStatusAt ?? checkoutUpdatedAt ?? null,
  }
}

function useCountdown(expiresAt: string | null) {
  const [secs, setSecs] = useState<number>(0)
  useEffect(() => {
    if (!expiresAt) {
      setSecs(0)
      return
    }
    const calc = () => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
    setSecs(calc())
    const t = setInterval(() => setSecs(calc()), 1000)
    return () => clearInterval(t)
  }, [expiresAt])
  const m = String(Math.floor(secs / 60)).padStart(2, '0')
  const s = String(secs % 60).padStart(2, '0')
  return { secs, label: `${m}:${s}` }
}

function firePixelPurchase(params: {
  checkoutId: string
  totalAmount: number
  productName: string
  qty: number
}) {
  try {
    if (typeof window !== 'undefined' && Array.isArray((window as never as { dataLayer?: unknown[] }).dataLayer)) {
      ;(window as never as { dataLayer: Record<string, unknown>[] }).dataLayer.push({
        event: 'purchase',
        ecommerce: {
          transaction_id: params.checkoutId,
          value: params.totalAmount,
          currency: 'BRL',
          items: [{
            item_id: params.checkoutId,
            item_name: params.productName,
            quantity: params.qty,
            price: params.totalAmount / Math.max(1, params.qty),
          }],
        },
      })
    }
    const fbq = (window as never as { fbq?: (...a: unknown[]) => void }).fbq
    if (typeof fbq === 'function') {
      fbq('track', 'Purchase', {
        value: params.totalAmount,
        currency: 'BRL',
        content_ids: [params.checkoutId],
        content_type: 'product',
        num_items: params.qty,
      })
    }
  } catch { }
}

interface Props {
  slug: string
  urlUtms: Record<string, string | undefined>
  checkoutId?: string
  sellerRef?: string
}

export function LojaClient({ slug, urlUtms, checkoutId, sellerRef }: Props) {
  const [step, setStep] = useState<Step>('loading')
  const [product, setProduct] = useState<ProductInfo | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const [name, setName] = useState('')
  const [docType, setDocType] = useState<DocType>('cpf')
  const [doc, setDoc] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [qty, setQty] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  const [pixData, setPixData] = useState<PixData | null>(null)
  const [copied, setCopied] = useState(false)
  const [deliveryState, setDeliveryState] = useState<DeliveryState | null>(null)
  const [deliveryEmail, setDeliveryEmail] = useState('')
  const [deliveryProfileReleased, setDeliveryProfileReleased] = useState(false)
  const [deliverySaving, setDeliverySaving] = useState(false)
  const [deliveryError, setDeliveryError] = useState('')
  const [deliverySuccessMsg, setDeliverySuccessMsg] = useState('')

  const pixelFiredRef = useRef(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { secs, label: countdown } = useCountdown(pixData?.expiresAt ?? null)
  const utmsRef = useRef<UtmData | null>(null)

  useEffect(() => {
    const captured = captureUtms()
    utmsRef.current = {
      ...captured,
      ...Object.fromEntries(Object.entries(urlUtms).filter(([, v]) => Boolean(v))),
    }
  }, [urlUtms])

  const applyCheckoutStatus = useCallback((checkout: CheckoutStatusResponse, cid: string) => {
    if (checkout.status === 'PAID') {
      if (pollRef.current) clearInterval(pollRef.current)
      const normalizedDelivery = normalizeDeliveryState(checkout.delivery, checkout.status, checkout.updatedAt ?? null)
      setDeliveryState(normalizedDelivery)
      setDeliveryEmail(normalizedDelivery.adspowerEmail ?? '')
      setDeliveryProfileReleased(normalizedDelivery.adspowerProfileReleased)
      setStep('delivery')
      return
    }

    if (checkout.status === 'EXPIRED' || checkout.status === 'CANCELLED') {
      if (pollRef.current) clearInterval(pollRef.current)
      setErrorMsg(checkout.status === 'EXPIRED' ? 'O PIX expirou. Gere um novo pedido.' : 'Este checkout foi cancelado.')
      setStep('error')
      return
    }

    if (checkout.pixCopyPaste && checkout.qrCodeBase64 && checkout.expiresAt) {
      setPixData({
        checkoutId: cid,
        orderNumber: checkout.orderNumber ?? null,
        txid: '',
        pixCopyPaste: checkout.pixCopyPaste,
        qrCodeBase64: checkout.qrCodeBase64,
        expiresAt: checkout.expiresAt,
        totalAmount: Number(checkout.totalAmount ?? 0),
        qty: Number(checkout.qty ?? 1),
        title: checkout.title ?? product?.title ?? 'Checkout PIX',
      })
      setStep('pix')
    }
  }, [product?.title])

  const fetchCheckoutStatus = useCallback(async (cid: string) => {
    const r = await fetch(`/api/loja/${slug}?checkoutId=${encodeURIComponent(cid)}`, { cache: 'no-store' })
    const data = (await r.json()) as CheckoutStatusResponse | { error?: string }
    if (!r.ok) throw new Error((data as { error?: string }).error ?? 'Erro ao consultar checkout')
    return data as CheckoutStatusResponse
  }, [slug])

  const startPolling = useCallback((cid: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const checkout = await fetchCheckoutStatus(cid)
        if (checkout.status !== 'PENDING') {
          applyCheckoutStatus(checkout, cid)
        }
      } catch { }
    }, 5000)
  }, [applyCheckoutStatus, fetchCheckoutStatus])

  useEffect(() => {
    fetch(`/api/loja/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setErrorMsg(data.error)
          setStep('error')
          return
        }
        setProduct(data)
        setStep((prev) => (prev === 'loading' ? 'form' : prev))
      })
      .catch(() => {
        setErrorMsg('Erro ao carregar produto.')
        setStep('error')
      })
  }, [slug])

  useEffect(() => {
    if (step === 'delivery' && pixData && !pixelFiredRef.current) {
      pixelFiredRef.current = true
      firePixelPurchase({
        checkoutId: pixData.checkoutId,
        totalAmount: pixData.totalAmount,
        productName: pixData.title,
        qty: pixData.qty,
      })
    }
  }, [step, pixData])

  useEffect(() => {
    if (!checkoutId) return
    fetchCheckoutStatus(checkoutId)
      .then((status) => applyCheckoutStatus(status, checkoutId))
      .catch(() => {
        setErrorMsg('Não foi possível restaurar este checkout.')
        setStep('error')
      })
  }, [applyCheckoutStatus, checkoutId, fetchCheckoutStatus])

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
  }, [])

  useEffect(() => {
    if (step === 'pix' && secs === 0) {
      if (pollRef.current) clearInterval(pollRef.current)
      setErrorMsg('O PIX expirou. Gere um novo pedido.')
      setStep('error')
    }
  }, [secs, step])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!product) return
    setSubmitting(true)
    setErrorMsg('')

    const waClean = phone.replace(/\D/g, '')
    const waE164 = `+55${waClean}`
    const docClean = doc.replace(/\D/g, '')
    const utmPayload = utmsRef.current ? buildUtmPayload(utmsRef.current) : {}

    const body: Record<string, unknown> = {
      name: name.trim(),
      whatsapp: waE164,
      email: email.trim() || undefined,
      qty,
      sellerRef: sellerRef || undefined,
      ...utmPayload,
    }
    if (docType === 'cnpj') body.cnpj = docClean
    else body.cpf = doc

    const res = await fetch(`/api/loja/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setSubmitting(false)

    if (!res.ok) {
      setErrorMsg(data.error ?? 'Erro ao gerar PIX.')
      setStep('error')
      return
    }

    const generated = data as PixData
    setPixData(generated)
    setStep('pix')
    startPolling(generated.checkoutId)
  }

  const handleDeliverySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pixData) return

    const normalizedEmail = normalizeEmail(deliveryEmail)
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setDeliveryError('Informe um e-mail AdsPower válido para continuar.')
      return
    }
    if (!deliveryProfileReleased) {
      setDeliveryError('Confirme que seu perfil está liberado no AdsPower para liberar a entrega.')
      return
    }

    setDeliveryError('')
    setDeliverySuccessMsg('')
    setDeliverySaving(true)

    const res = await fetch(`/api/loja/${slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkoutId: pixData.checkoutId,
        adspowerEmail: normalizedEmail,
        adspowerProfileReleased: true,
      }),
    })
    const data = await res.json()
    setDeliverySaving(false)

    if (!res.ok) {
      setDeliveryError(data.error ?? 'Não foi possível salvar os dados de entrega.')
      return
    }

    const nextDelivery = data.delivery as DeliveryState | undefined
    if (nextDelivery) {
      setDeliveryState(nextDelivery)
      setDeliveryEmail(nextDelivery.adspowerEmail ?? normalizedEmail)
      setDeliveryProfileReleased(nextDelivery.adspowerProfileReleased)
    }
    setDeliverySuccessMsg('Dados enviados com sucesso. Você já pode acompanhar o status da entrega abaixo.')
  }

  const copyPix = async () => {
    if (!pixData) return
    await navigator.clipboard.writeText(pixData.pixCopyPaste)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  const total = product ? product.pricePerUnit * qty : 0

  if (step === 'loading') {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  if (step === 'error') {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-sm w-full text-center space-y-4">
          <div className="text-4xl">❌</div>
          <p className="text-white font-semibold text-lg">Ops!</p>
          <p className="text-zinc-400 text-sm">{errorMsg}</p>
          <button
            onClick={() => { setErrorMsg(''); setStep('form') }}
            className="w-full py-3 rounded-xl bg-zinc-800 text-white text-sm font-medium hover:bg-zinc-700 transition"
          >
            Tentar novamente
          </button>
        </div>
      </main>
    )
  }

  if (step === 'pix' && pixData) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden max-w-sm w-full">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-white/70 text-xs uppercase tracking-wider">Aguardando pagamento</p>
              <p className="text-white font-bold text-lg leading-tight">{pixData.title}</p>
            </div>
            <div className="text-right">
              <p className="text-white/70 text-xs">Expira em</p>
              <p className={`font-mono font-bold text-xl ${secs < 120 ? 'text-red-300' : 'text-white'}`}>
                {countdown}
              </p>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div className={`rounded-xl border px-4 py-3 ${
              secs < 120
                ? 'border-red-500/50 bg-red-500/10'
                : 'border-emerald-500/30 bg-emerald-500/10'
            }`}>
              <p className="text-[11px] uppercase tracking-wider text-zinc-300">Cronômetro de foco</p>
              <p className={`mt-1 font-mono font-bold text-2xl ${
                secs < 120 ? 'text-red-300' : 'text-emerald-300'
              }`}>
                {countdown}
              </p>
              <p className="mt-1 text-xs text-zinc-300">
                Complete o pagamento agora para evitar expiração do pedido.
              </p>
            </div>

            <div className="flex flex-col items-center space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                alt="QR Code PIX"
                className="w-52 h-52 rounded-xl border border-zinc-700"
              />
              <p className="text-zinc-500 text-xs">Escaneie o QR Code com seu banco</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-zinc-600 text-xs">ou copie o código</span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>

            <button
              onClick={copyPix}
              className={`w-full py-3.5 rounded-xl border text-sm font-semibold transition flex items-center justify-center gap-2 ${
                copied
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                  : 'bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700'
              }`}
            >
              {copied ? '✅ Copiado!' : '📋 Copiar PIX Copia e Cola'}
            </button>

            <div className="bg-zinc-800/50 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-zinc-500 text-[11px]">
                  Pedido {pixData.orderNumber ? `#${pixData.orderNumber}` : `#${pixData.checkoutId}`}
                </p>
                <p className="text-zinc-500 text-xs">Valor total</p>
                <p className="text-white font-bold text-xl">
                  R$ {pixData.totalAmount.toFixed(2).replace('.', ',')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-zinc-500 text-xs">{pixData.qty}x unidade(s)</p>
                <p className="text-zinc-400 text-sm">{pixData.title}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 justify-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-zinc-500 text-xs">Aguardando confirmação do banco...</p>
            </div>
          </div>
        </div>
      </main>
    )
  }

  if (step === 'delivery' && pixData) {
    const currentDelivery = deliveryState ?? getDefaultDeliveryState('PAID')
    const currentOrder = DELIVERY_FLOW_LABELS[currentDelivery.flowStatus].order
    const canEditData = currentDelivery.flowStatus === 'WAITING_CUSTOMER_DATA' || currentDelivery.flowStatus === 'DELIVERY_REQUESTED'
    const waNumber = (process.env.NEXT_PUBLIC_WA_SUPPORT_NUMBER ?? '').replace(/\D/g, '')
    const refreshUrl = `/loja/${slug}?checkoutId=${encodeURIComponent(pixData.checkoutId)}`
    const waText = encodeURIComponent(
      `Olá, equipe Ads Ativos. Pedido #${pixData.orderNumber ?? pixData.checkoutId}. Já paguei e preciso acompanhar a entrega.`
    )

    return (
      <main className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden max-w-xl w-full">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 text-center">
            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
              <span className="text-3xl">🚚</span>
            </div>
            <p className="text-white font-bold text-2xl">Entrega AdsPower</p>
            <p className="text-white/85 text-sm mt-1">Pagamento aprovado. Complete os dados para liberar a entrega.</p>
          </div>

          <div className="p-6 space-y-5">
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 space-y-2">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Resumo do pedido</p>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-white text-sm font-semibold">{pixData.title}</p>
                  <p className="text-zinc-400 text-xs">
                    Pedido #{pixData.orderNumber ?? pixData.checkoutId}
                  </p>
                </div>
                <span className="text-emerald-400 font-bold text-lg">
                  R$ {pixData.totalAmount.toFixed(2).replace('.', ',')}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
              <p className="text-amber-300 font-semibold text-sm">⚠️ Atenção obrigatória</p>
              <p className="text-amber-100/90 text-sm leading-relaxed">
                É importante ter perfil liberado no AdsPower para que a entrega seja feita de maneira correta.
                Se não tiver perfil liberado, o sistema não deixa enviar.
              </p>
            </div>

            <form onSubmit={handleDeliverySubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-zinc-300 text-xs uppercase tracking-wider font-medium">
                  Digite aqui seu e-mail do AdsPower para que possamos realizar a entrega
                </label>
                <input
                  type="email"
                  required
                  value={deliveryEmail}
                  onChange={(e) => setDeliveryEmail(e.target.value)}
                  disabled={!canEditData}
                  placeholder="seu-email-adspower@exemplo.com"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition text-sm disabled:opacity-70"
                />
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-zinc-700 bg-zinc-800/60 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deliveryProfileReleased}
                  onChange={(e) => setDeliveryProfileReleased(e.target.checked)}
                  disabled={!canEditData}
                  className="mt-0.5 w-4 h-4 accent-emerald-500"
                />
                <span className="text-sm text-zinc-200 leading-relaxed">
                  Confirmo que meu perfil AdsPower está liberado para receber a entrega deste pedido.
                </span>
              </label>

              {deliveryError ? (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {deliveryError}
                </p>
              ) : null}
              {deliverySuccessMsg ? (
                <p className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                  {deliverySuccessMsg}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={deliverySaving || !canEditData}
                className="w-full py-3 rounded-xl font-bold text-white text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, #10b981, #0ea5e9)' }}
              >
                {deliverySaving ? 'Enviando dados de entrega...' : 'Enviar dados para entrega'}
              </button>
            </form>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold text-sm">Status da entrega</h3>
                <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                  {DELIVERY_FLOW_LABELS[currentDelivery.flowStatus].title}
                </span>
              </div>

              <div className="space-y-2">
                {DELIVERY_TIMELINE.map((status) => {
                  const cfg = DELIVERY_FLOW_LABELS[status]
                  const isDone = currentOrder >= cfg.order
                  const isCurrent = currentDelivery.flowStatus === status
                  return (
                    <div
                      key={status}
                      className={`rounded-lg border px-3 py-2 ${
                        isCurrent
                          ? 'border-emerald-500/50 bg-emerald-500/10'
                          : isDone
                            ? 'border-emerald-500/30 bg-zinc-800/60'
                            : 'border-zinc-700 bg-zinc-900/50'
                      }`}
                    >
                      <p className={`text-sm font-medium ${isDone ? 'text-emerald-300' : 'text-zinc-300'}`}>
                        {isDone ? '✅' : '⏳'} {cfg.title}
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">{cfg.description}</p>
                    </div>
                  )
                })}
              </div>

              <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 px-3 py-2 text-xs text-zinc-300 space-y-1">
                <p><span className="text-zinc-500">Status atual:</span> {currentDelivery.deliveryStatusNote ?? 'Aguardando atualização da equipe.'}</p>
                {currentDelivery.lastStatusAt ? (
                  <p><span className="text-zinc-500">Última atualização:</span> {new Date(currentDelivery.lastStatusAt).toLocaleString('pt-BR')}</p>
                ) : null}
                {currentDelivery.deliveryRequestedAt ? (
                  <p><span className="text-zinc-500">Dados enviados em:</span> {new Date(currentDelivery.deliveryRequestedAt).toLocaleString('pt-BR')}</p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {waNumber ? (
                <a
                  href={`https://wa.me/${waNumber}?text=${waText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-[180px] text-center py-2.5 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-semibold transition"
                >
                  Falar com suporte no WhatsApp
                </a>
              ) : null}
              <a
                href={refreshUrl}
                className="flex-1 min-w-[180px] text-center py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-semibold transition"
              >
                Atualizar status agora
              </a>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden max-w-sm w-full">
        {product?.badge ? (
          <div className="flex justify-center pt-5">
            <span className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold px-4 py-1.5 rounded-full tracking-wider uppercase">
              🚀 {product.badge}
            </span>
          </div>
        ) : null}

        <div className="px-6 pt-4 pb-2 text-center">
          <h1 className="text-white font-bold text-2xl leading-tight">{product?.title}</h1>
          {product && product.available > 0 ? (
            <p className="text-emerald-400 text-sm font-medium mt-1">
              DISPONÍVEL: {product.available} UNIDADE{product.available !== 1 ? 'S' : ''}
            </p>
          ) : null}
          {product && product.available === 0 ? (
            <p className="text-red-400 text-sm font-medium mt-1">ESGOTADO</p>
          ) : null}
          {product?.subtitle ? (
            <p className="text-zinc-500 text-xs mt-1 whitespace-pre-line">{product.subtitle}</p>
          ) : null}
          {product?.fullDescription ? (
            <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
              <p className="text-zinc-300 text-xs whitespace-pre-line leading-relaxed">{product.fullDescription}</p>
            </div>
          ) : null}
          {(product?.stockProductCode || product?.stockProductName) ? (
            <p className="text-zinc-600 text-[11px] mt-1">
              Vinculado ao estoque: {product.stockProductCode || '—'}{product.stockProductName ? ` · ${product.stockProductName}` : ''}
            </p>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 pt-2 space-y-4">
          <div className="space-y-1">
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Nome completo</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="João da Silva"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">WhatsApp (receber acesso)</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="(11) 99999-9999"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
              E-mail <span className="text-zinc-600 normal-case">(recomendado)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition text-sm"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setDocType('cpf'); setDoc('') }}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition ${
                  docType === 'cpf'
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                👤 Pessoa Física (CPF)
              </button>
              <button
                type="button"
                onClick={() => { setDocType('cnpj'); setDoc('') }}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition ${
                  docType === 'cnpj'
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                🏢 Pessoa Jurídica (CNPJ)
              </button>
            </div>

            {docType === 'cpf' ? (
              <input
                key="cpf"
                type="text"
                required
                value={doc}
                onChange={(e) => setDoc(formatCpf(e.target.value))}
                placeholder="000.000.000-00"
                inputMode="numeric"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition text-sm"
              />
            ) : (
              <input
                key="cnpj"
                type="text"
                required
                value={doc}
                onChange={(e) => setDoc(formatCnpj(e.target.value))}
                placeholder="00.000.000/0001-00"
                inputMode="numeric"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition text-sm"
              />
            )}
          </div>

          {product && product.maxQty > 1 ? (
            <div className="space-y-1">
              <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Quantidade</label>
              <div className="flex items-center gap-4 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="w-10 h-10 flex items-center justify-center bg-zinc-700 rounded-lg text-white font-bold text-lg hover:bg-zinc-600 transition disabled:opacity-40"
                  disabled={qty <= 1}
                >
                  −
                </button>
                <div className="flex-1 text-center">
                  <p className="text-white font-bold text-2xl">{qty}</p>
                  <p className="text-zinc-500 text-xs">UNIDADES</p>
                </div>
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(product.maxQty, q + 1))}
                  className="w-10 h-10 flex items-center justify-center bg-zinc-700 rounded-lg text-white font-bold text-lg hover:bg-zinc-600 transition disabled:opacity-40"
                  disabled={qty >= product.maxQty}
                >
                  +
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between py-2 border-t border-zinc-800">
            <span className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Total</span>
            <span className="text-white font-bold text-2xl">R$ {total.toFixed(2).replace('.', ',')}</span>
          </div>

          <button
            type="submit"
            disabled={submitting || !product || product.available === 0}
            className="w-full py-4 rounded-xl font-bold text-white text-base tracking-wide transition disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #10b981, #0ea5e9)' }}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Gerando PIX...
              </span>
            ) : product?.available === 0 ? (
              'ESGOTADO'
            ) : (
              '⚡ PAGAR COM PIX'
            )}
          </button>

          <div className="flex items-center justify-center gap-4 pt-1">
            <span className="text-zinc-600 text-[11px] flex items-center gap-1">🔒 Pagamento seguro</span>
            <span className="text-zinc-600 text-[11px] flex items-center gap-1">✅ PIX instantâneo</span>
          </div>

          <button
            type="button"
            onClick={() => window.history.back()}
            className="w-full py-2 text-zinc-600 text-xs hover:text-zinc-400 transition"
          >
            CANCELAR
          </button>
        </form>
      </div>
    </main>
  )
}
