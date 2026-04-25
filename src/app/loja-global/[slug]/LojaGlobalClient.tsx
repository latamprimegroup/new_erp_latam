'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { captureUtms, buildUtmPayload, type UtmData } from '@/lib/utm-tracker'
import { QUICK_SALE_LEGAL_TERMS_TEXT } from '@/lib/quick-sale-legal-terms'

type DocType = 'cpf' | 'cnpj'
type Gateway = 'KAST' | 'MERCURY'
type Step = 'loading' | 'form' | 'payment' | 'delivery' | 'error'
type RetryableGlobalCheckoutInput = {
  name: string
  docType: DocType
  doc: string
  phone: string
  email: string
  qty: number
  paymentMethod: Gateway
  acceptTerms: boolean
}

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
  paymentMode: 'GLOBAL'
  globalGateways: Gateway[]
  paymentMethods: Gateway[]
}

type DeliveryFlowStatus =
  | 'PENDING_PAYMENT'
  | 'PENDING_KYC'
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

interface PaymentPayload {
  invoiceUrl?: string
  expiresAt?: string
  reference?: string
  instructions?: {
    bankName: string
    accountName: string
    routingNumber: string
    accountNumber: string
    beneficiaryEmail: string | null
    amountUsd: number
    amountBrlEstimate: number
    reference: string
    note: string
  }
}

interface CheckoutCreatedResponse {
  checkoutId: string
  orderNumber?: string | null
  expiresAt?: string | null
  paymentMethod: Gateway
  paymentPayload: PaymentPayload
  totalAmount: number
  qty: number
  title: string
  resumeUrl: string
}

interface CheckoutStatusResponse {
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED'
  orderNumber?: string | null
  updatedAt?: string | null
  paidAt?: string | null
  expiresAt?: string | null
  totalAmount?: number
  qty?: number
  title?: string | null
  paymentMethod?: Gateway
  paymentPayload?: PaymentPayload | null
  delivery?: DeliveryState
}

const DELIVERY_FLOW_LABELS: Record<DeliveryFlowStatus, { title: string; description: string; order: number }> = {
  PENDING_PAYMENT: {
    title: 'Aguardando pagamento',
    description: 'O pagamento global precisa ser confirmado para liberar a etapa de entrega.',
    order: 0,
  },
  PENDING_KYC: {
    title: 'Aguardando KYC',
    description: 'Envie documento e selfie para validação de identidade.',
    order: 1,
  },
  WAITING_CUSTOMER_DATA: {
    title: 'Aguardando dados AdsPower',
    description: 'Preencha seu e-mail AdsPower e confirme que o perfil está liberado.',
    order: 2,
  },
  DELIVERY_REQUESTED: {
    title: 'Dados de entrega recebidos',
    description: 'Estamos validando seu perfil e separando a entrega.',
    order: 3,
  },
  DELIVERY_IN_PROGRESS: {
    title: 'Entrega em andamento',
    description: 'Equipe Ads Ativos está liberando o ativo.',
    order: 4,
  },
  DELIVERED: {
    title: 'Entrega concluída',
    description: 'Seu ativo já foi entregue.',
    order: 5,
  },
}

const DELIVERY_TIMELINE: DeliveryFlowStatus[] = [
  'PENDING_KYC',
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
  const h = String(Math.floor(secs / 3600)).padStart(2, '0')
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0')
  const s = String(secs % 60).padStart(2, '0')
  return { secs, label: `${h}:${m}:${s}` }
}

function resolvePaymentExpiry(data: {
  checkoutExpiresAt?: string | null
  paymentPayload?: PaymentPayload | null
}) {
  return data.checkoutExpiresAt ?? data.paymentPayload?.expiresAt ?? null
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

interface Props {
  slug: string
  urlUtms: Record<string, string | undefined>
  checkoutId?: string
  sellerRef?: string
}

export function LojaGlobalClient({ slug, urlUtms, checkoutId, sellerRef }: Props) {
  const [step, setStep] = useState<Step>('loading')
  const [product, setProduct] = useState<ProductInfo | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const [name, setName] = useState('')
  const [docType, setDocType] = useState<DocType>('cpf')
  const [doc, setDoc] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [qty, setQty] = useState(1)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [selectedGateway, setSelectedGateway] = useState<Gateway>('KAST')
  const [submitting, setSubmitting] = useState(false)

  const [checkoutData, setCheckoutData] = useState<CheckoutCreatedResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const [deliveryState, setDeliveryState] = useState<DeliveryState | null>(null)
  const [deliveryEmail, setDeliveryEmail] = useState('')
  const [deliveryProfileReleased, setDeliveryProfileReleased] = useState(false)
  const [deliverySaving, setDeliverySaving] = useState(false)
  const [deliveryError, setDeliveryError] = useState('')
  const [deliverySuccessMsg, setDeliverySuccessMsg] = useState('')
  const [checkingPayment, setCheckingPayment] = useState(false)
  const [paymentCheckHint, setPaymentCheckHint] = useState('')
  const [retryingCheckout, setRetryingCheckout] = useState(false)
  const [lastCheckoutInput, setLastCheckoutInput] = useState<RetryableGlobalCheckoutInput | null>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const utmsRef = useRef<UtmData | null>(null)
  const paymentExpiresAt = resolvePaymentExpiry({
    checkoutExpiresAt: checkoutData?.expiresAt ?? null,
    paymentPayload: checkoutData?.paymentPayload ?? null,
  })
  const { secs: paymentSecs, label: paymentCountdown } = useCountdown(paymentExpiresAt)

  const total = useMemo(() => {
    if (!product) return 0
    return product.pricePerUnit * qty
  }, [product, qty])

  useEffect(() => {
    const captured = captureUtms()
    utmsRef.current = {
      ...captured,
      ...Object.fromEntries(Object.entries(urlUtms).filter(([, v]) => Boolean(v))),
    }
  }, [urlUtms])

  const fetchCheckoutStatus = useCallback(async (cid: string) => {
    const r = await fetch(`/api/loja-global/${slug}?checkoutId=${encodeURIComponent(cid)}`, { cache: 'no-store' })
    const data = await r.json() as CheckoutStatusResponse | { error?: string }
    if (!r.ok) throw new Error((data as { error?: string }).error ?? 'Erro ao consultar checkout')
    return data as CheckoutStatusResponse
  }, [slug])

  const applyCheckoutStatus = useCallback((checkout: CheckoutStatusResponse, cid: string) => {
    if (checkout.status === 'PAID') {
      if (pollRef.current) clearInterval(pollRef.current)
      setDeliveryState(normalizeDeliveryState(checkout.delivery, checkout.status, checkout.updatedAt ?? null))
      setStep('delivery')
      return
    }
    if (checkout.status === 'EXPIRED' || checkout.status === 'CANCELLED') {
      if (pollRef.current) clearInterval(pollRef.current)
      setErrorMsg(checkout.status === 'EXPIRED' ? 'Este checkout global expirou.' : 'Este checkout global foi cancelado.')
      setStep('error')
      return
    }
    if (checkout.status === 'PENDING') {
      setCheckoutData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          orderNumber: checkout.orderNumber ?? prev.orderNumber,
          expiresAt: checkout.expiresAt ?? prev.expiresAt ?? null,
          paymentMethod: checkout.paymentMethod ?? prev.paymentMethod,
          paymentPayload: checkout.paymentPayload ?? prev.paymentPayload,
        }
      })
      setStep('payment')
    }
    void cid
  }, [])

  const startPolling = useCallback((cid: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const status = await fetchCheckoutStatus(cid)
        if (status.status !== 'PENDING') {
          applyCheckoutStatus(status, cid)
        }
      } catch {
        // ignore transient errors
      }
    }, 7000)
  }, [applyCheckoutStatus, fetchCheckoutStatus])

  useEffect(() => {
    fetch(`/api/loja-global/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setErrorMsg(data.error)
          setStep('error')
          return
        }
        const info = data as ProductInfo
        setProduct(info)
        setSelectedGateway((current) => info.paymentMethods.includes(current) ? current : info.paymentMethods[0] ?? 'KAST')
        setStep('form')
      })
      .catch(() => {
        setErrorMsg('Erro ao carregar produto global.')
        setStep('error')
      })
  }, [slug])

  useEffect(() => {
    if (!checkoutId) return
    fetchCheckoutStatus(checkoutId)
      .then((status) => {
        setCheckoutData((prev) => ({
          checkoutId,
          orderNumber: status.orderNumber ?? prev?.orderNumber ?? null,
          expiresAt: status.expiresAt ?? prev?.expiresAt ?? null,
          paymentMethod: status.paymentMethod ?? prev?.paymentMethod ?? 'KAST',
          paymentPayload: status.paymentPayload ?? prev?.paymentPayload ?? {},
          totalAmount: status.totalAmount ?? prev?.totalAmount ?? 0,
          qty: status.qty ?? prev?.qty ?? 1,
          title: status.title ?? prev?.title ?? 'Pedido Global',
          resumeUrl: typeof window !== 'undefined' ? window.location.href : '',
        }))
        applyCheckoutStatus(status, checkoutId)
      })
      .catch(() => {
        setErrorMsg('Não foi possível restaurar este checkout global.')
        setStep('error')
      })
  }, [applyCheckoutStatus, checkoutId, fetchCheckoutStatus])

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
  }, [])

  useEffect(() => {
    if (step === 'payment' && paymentExpiresAt && paymentSecs === 0) {
      if (pollRef.current) clearInterval(pollRef.current)
      setErrorMsg('O prazo deste pagamento global expirou. Gere um novo checkout para continuar.')
      setStep('error')
    }
  }, [step, paymentExpiresAt, paymentSecs])

  useEffect(() => {
    if (step !== 'payment') setPaymentCheckHint('')
  }, [step])

  const createGlobalCheckout = async (input: RetryableGlobalCheckoutInput, fromRetry = false) => {
    if (!product) return
    if (!product.paymentMethods.includes(input.paymentMethod)) {
      setErrorMsg('Selecione um método de pagamento disponível para este link.')
      setStep('error')
      return
    }
    if (fromRetry) setRetryingCheckout(true)
    else setSubmitting(true)
    setErrorMsg('')
    setPaymentCheckHint('')

    try {
      const waClean = input.phone.replace(/\D/g, '')
      const waE164 = `+55${waClean}`
      const docClean = input.doc.replace(/\D/g, '')
      const utmPayload = utmsRef.current ? buildUtmPayload(utmsRef.current) : {}

      const body: Record<string, unknown> = {
        name: input.name.trim(),
        whatsapp: waE164,
        email: input.email.trim() || undefined,
        qty: Math.max(1, Math.min(input.qty, product.maxQty, product.available)),
        paymentMethod: input.paymentMethod,
        acceptTerms: input.acceptTerms,
        sellerRef: sellerRef || undefined,
        ...utmPayload,
      }
      if (input.docType === 'cnpj') body.cnpj = docClean
      else body.cpf = docClean

      const res = await fetch(`/api/loja-global/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Erro ao gerar checkout global.')
        setStep('error')
        return
      }

      const created = data as CheckoutCreatedResponse
      created.expiresAt = created.expiresAt ?? created.paymentPayload?.expiresAt ?? null
      setLastCheckoutInput(input)
      setCheckoutData(created)
      setStep('payment')
      startPolling(created.checkoutId)
    } catch {
      setErrorMsg('Falha de conexão ao gerar checkout global. Tente novamente.')
      setStep('error')
    } finally {
      if (fromRetry) setRetryingCheckout(false)
      else setSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createGlobalCheckout({
      name,
      docType,
      doc,
      phone,
      email,
      qty,
      paymentMethod: selectedGateway,
      acceptTerms,
    })
  }

  const checkPaymentNow = async () => {
    if (!checkoutData) return
    setCheckingPayment(true)
    setPaymentCheckHint('')
    try {
      const status = await fetchCheckoutStatus(checkoutData.checkoutId)
      applyCheckoutStatus(status, checkoutData.checkoutId)
      if (status.status === 'PENDING') {
        setPaymentCheckHint('Pagamento ainda não confirmado. Continuaremos atualizando automaticamente.')
      }
    } catch {
      setPaymentCheckHint('Não foi possível validar agora. Tente novamente em instantes.')
    } finally {
      setCheckingPayment(false)
    }
  }

  const handleDeliverySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!checkoutData) return
    const normalizedEmail = normalizeEmail(deliveryEmail)
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setDeliveryError('Informe um e-mail AdsPower válido para continuar.')
      return
    }
    if (!deliveryProfileReleased) {
      setDeliveryError('Confirme que seu perfil está liberado no AdsPower para liberar a entrega.')
      return
    }
    setDeliverySaving(true)
    setDeliveryError('')
    setDeliverySuccessMsg('')

    const res = await fetch(`/api/loja-global/${slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkoutId: checkoutData.checkoutId,
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
    setDeliverySuccessMsg('Dados enviados com sucesso. Acompanhe o status da entrega abaixo.')
  }

  const copyMercuryReference = async () => {
    const reference = checkoutData?.paymentPayload?.reference
    if (!reference) return
    await navigator.clipboard.writeText(reference)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  if (step === 'loading') {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  if (step === 'error') {
    const canRetryExpired = Boolean(
      lastCheckoutInput && /expirou|expirad/i.test(errorMsg),
    )
    return (
      <main className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md w-full text-center space-y-4">
          <div className="text-4xl">❌</div>
          <p className="text-white font-semibold text-lg">Ops!</p>
          <p className="text-zinc-400 text-sm">{errorMsg}</p>
          {canRetryExpired ? (
            <button
              onClick={() => {
                if (!lastCheckoutInput) return
                void createGlobalCheckout(lastCheckoutInput, true)
              }}
              disabled={retryingCheckout}
              className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 transition"
            >
              {retryingCheckout ? 'Gerando novo pagamento...' : 'Gerar novo pagamento com os mesmos dados'}
            </button>
          ) : null}
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

  if (step === 'payment' && checkoutData) {
    const isKast = checkoutData.paymentMethod === 'KAST'
    const instructions = checkoutData.paymentPayload.instructions
    return (
      <main className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden max-w-xl w-full">
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-5 text-center">
            <p className="text-white/70 text-xs uppercase tracking-wider">Venda Rápida Global</p>
            <p className="text-white font-bold text-2xl">{checkoutData.title}</p>
            <p className="text-white/80 text-sm mt-1">
              Pedido #{checkoutData.orderNumber ?? checkoutData.checkoutId} · Método: {checkoutData.paymentMethod}
            </p>
            {paymentExpiresAt ? (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/30 bg-black/20 px-3 py-1">
                <span className="text-white/80 text-[11px] uppercase tracking-wider">Expira em</span>
                <span className={`font-mono font-bold text-sm ${paymentSecs < 300 ? 'text-red-200' : 'text-white'}`}>
                  {paymentCountdown}
                </span>
              </div>
            ) : null}
          </div>

          <div className="p-6 space-y-4">
            {paymentExpiresAt ? (
              <div className={`rounded-xl border px-4 py-3 ${
                paymentSecs < 300
                  ? 'border-red-500/50 bg-red-500/10'
                  : 'border-indigo-500/30 bg-indigo-500/10'
              }`}>
                <p className="text-[11px] uppercase tracking-wider text-zinc-300">Cronômetro de foco</p>
                <p className={`mt-1 font-mono font-bold text-2xl ${
                  paymentSecs < 300 ? 'text-red-300' : 'text-indigo-200'
                }`}>
                  {paymentCountdown}
                </p>
                <p className="mt-1 text-xs text-zinc-300">
                  Finalize seu pagamento dentro da janela para evitar expiração do pedido.
                </p>
                {paymentSecs < 300 ? (
                  <p className="mt-1 text-[11px] font-semibold text-red-200">⚠️ Últimos minutos para concluir o pagamento.</p>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 p-4 flex items-center justify-between">
              <div>
                <p className="text-zinc-500 text-xs">Valor total</p>
                <p className="text-white font-bold text-xl">R$ {checkoutData.totalAmount.toFixed(2).replace('.', ',')}</p>
              </div>
              <p className="text-zinc-400 text-sm">{checkoutData.qty}x unidade(s)</p>
            </div>

            {isKast ? (
              <div className="space-y-3">
                <p className="text-zinc-200 text-sm">
                  Clique no botão abaixo para abrir a fatura Kast e concluir o pagamento.
                </p>
                <a
                  href={checkoutData.paymentPayload.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition"
                >
                  Abrir fatura Kast
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-zinc-200 text-sm">Faça a transferência internacional via Mercury com os dados abaixo:</p>
                <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-4 space-y-2 text-sm">
                  <p className="text-zinc-300"><span className="text-zinc-500">Banco:</span> {instructions?.bankName || 'Mercury Bank'}</p>
                  <p className="text-zinc-300"><span className="text-zinc-500">Conta:</span> {instructions?.accountName || '-'}</p>
                  <p className="text-zinc-300"><span className="text-zinc-500">Routing:</span> {instructions?.routingNumber || '-'}</p>
                  <p className="text-zinc-300"><span className="text-zinc-500">Account:</span> {instructions?.accountNumber || '-'}</p>
                  <p className="text-zinc-300"><span className="text-zinc-500">Valor USD:</span> {instructions?.amountUsd?.toFixed(2) ?? '-'}</p>
                  <p className="text-zinc-300"><span className="text-zinc-500">Referência:</span> {instructions?.reference || checkoutData.paymentPayload.reference || '-'}</p>
                  <p className="text-zinc-500 text-xs">{instructions?.note}</p>
                </div>
                <button
                  type="button"
                  onClick={copyMercuryReference}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition ${
                    copied ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700'
                  }`}
                >
                  {copied ? 'Referência copiada!' : 'Copiar referência Mercury'}
                </button>
              </div>
            )}

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              Após o pagamento, esta página será atualizada automaticamente e liberará a etapa de entrega.
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={checkPaymentNow}
                disabled={checkingPayment}
                className="w-full py-2.5 rounded-xl border border-zinc-700 text-zinc-100 text-sm font-semibold hover:bg-zinc-800 transition disabled:opacity-60"
              >
                {checkingPayment ? 'Validando pagamento...' : 'Já paguei — validar agora'}
              </button>
              {paymentCheckHint ? (
                <p className="text-xs text-zinc-400 text-center">{paymentCheckHint}</p>
              ) : null}
            </div>
          </div>
        </div>
      </main>
    )
  }

  if (step === 'delivery' && checkoutData) {
    const currentDelivery = deliveryState ?? getDefaultDeliveryState('PAID')
    const currentOrder = DELIVERY_FLOW_LABELS[currentDelivery.flowStatus].order
    const canEditData = currentDelivery.flowStatus === 'WAITING_CUSTOMER_DATA' || currentDelivery.flowStatus === 'DELIVERY_REQUESTED'
    const waNumber = (process.env.NEXT_PUBLIC_WA_SUPPORT_NUMBER ?? '').replace(/\D/g, '')
    const refreshUrl = `/loja-global/${slug}?checkoutId=${encodeURIComponent(checkoutData.checkoutId)}`
    const waText = encodeURIComponent(
      `Ola, equipe Ads Ativos. Pedido #${checkoutData.orderNumber ?? checkoutData.checkoutId}. Ja paguei e preciso acompanhar a entrega global.`,
    )
    return (
      <main className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden max-w-xl w-full">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 text-center">
            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
              <span className="text-3xl">🚚</span>
            </div>
            <p className="text-white font-bold text-2xl">Entrega AdsPower</p>
            <p className="text-white/85 text-sm mt-1">Pagamento global aprovado. Complete os dados para liberar a entrega.</p>
          </div>

          <div className="p-6 space-y-5">
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 space-y-2">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Resumo do pedido</p>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-white text-sm font-semibold">{checkoutData.title}</p>
                  <p className="text-zinc-400 text-xs">Pedido #{checkoutData.orderNumber ?? checkoutData.checkoutId}</p>
                </div>
                <span className="text-emerald-400 font-bold text-lg">R$ {checkoutData.totalAmount.toFixed(2).replace('.', ',')}</span>
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
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{deliveryError}</p>
              ) : null}
              {deliverySuccessMsg ? (
                <p className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">{deliverySuccessMsg}</p>
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
            <span className="bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-bold px-4 py-1.5 rounded-full tracking-wider uppercase">
              🌍 {product.badge}
            </span>
          </div>
        ) : null}

        <div className="px-6 pt-4 pb-2 text-center">
          <h1 className="text-white font-bold text-2xl leading-tight">{product?.title}</h1>
          <p className="text-indigo-300 text-sm font-medium mt-1">CHECKOUT GLOBAL · KAST / MERCURY</p>
          {product?.subtitle ? <p className="text-zinc-500 text-xs mt-1 whitespace-pre-line">{product.subtitle}</p> : null}
          {product?.fullDescription ? (
            <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
              <p className="text-zinc-300 text-xs whitespace-pre-line leading-relaxed">{product.fullDescription}</p>
            </div>
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
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">WhatsApp</label>
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
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">E-mail</label>
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
                CPF
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
                CNPJ
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

          <div className="space-y-1">
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Método de pagamento global</label>
            <div className="grid grid-cols-1 gap-2">
              {product?.paymentMethods.map((gateway) => (
                <label
                  key={gateway}
                  className={`rounded-xl border px-3 py-2 cursor-pointer transition ${
                    selectedGateway === gateway
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : 'border-zinc-700 bg-zinc-800 text-zinc-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="global-gateway"
                    checked={selectedGateway === gateway}
                    onChange={() => setSelectedGateway(gateway)}
                    className="mr-2 accent-emerald-500"
                  />
                  {gateway === 'KAST' ? 'Kast (cripto)' : 'Mercury (wire USD)'}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between py-2 border-t border-zinc-800">
            <span className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Total</span>
            <span className="text-white font-bold text-2xl">R$ {total.toFixed(2).replace('.', ',')}</span>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-zinc-700 bg-zinc-800/60 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-emerald-500"
            />
            <span className="text-xs text-zinc-300 leading-relaxed">
              {QUICK_SALE_LEGAL_TERMS_TEXT}
            </span>
          </label>

          <button
            type="submit"
            disabled={submitting || !product || product.available === 0 || !acceptTerms}
            className="w-full py-4 rounded-xl font-bold text-white text-base tracking-wide transition disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
          >
            {submitting ? 'Gerando checkout global...' : '🌍 GERAR PAGAMENTO GLOBAL'}
          </button>
        </form>
      </div>
    </main>
  )
}
