'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { captureUtms, buildUtmPayload, type UtmData } from '@/lib/utm-tracker'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ProductInfo {
  id:           string
  slug:         string
  title:        string
  subtitle:     string | null
  badge:        string | null
  pricePerUnit: number
  maxQty:       number
  available:    number
}

interface PixData {
  checkoutId:   string
  txid:         string
  pixCopyPaste: string
  qrCodeBase64: string
  expiresAt:    string
  totalAmount:  number
  qty:          number
  title:        string
}

type Step    = 'form' | 'pix' | 'success' | 'error' | 'loading'
type DocType = 'cpf' | 'cnpj'

// ─── UTM helpers ─────────────────────────────────────────────────────────────
// Removido: persistência local duplicada — centralizada em @/lib/utm-tracker (30 dias)

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
  if (d.length <= 2)  return `(${d}`
  if (d.length <= 7)  return `(${d.slice(0,2)}) ${d.slice(2)}`
  if (d.length <= 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
  return v
}

function useCountdown(expiresAt: string | null) {
  const [secs, setSecs] = useState<number>(0)
  useEffect(() => {
    if (!expiresAt) return
    const calc = () => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
    setSecs(calc())
    const t = setInterval(() => setSecs(calc()), 1000)
    return () => clearInterval(t)
  }, [expiresAt])
  const m = String(Math.floor(secs / 60)).padStart(2, '0')
  const s = String(secs % 60).padStart(2, '0')
  return { secs, label: `${m}:${s}` }
}

// Dispara evento de Purchase para GTM / FB Pixel / GA4
function firePixelPurchase(params: {
  checkoutId: string
  totalAmount: number
  productName: string
  qty: number
}) {
  try {
    // GTM dataLayer (captura Google Ads + GA4 via GTM)
    if (typeof window !== 'undefined' && Array.isArray((window as never as { dataLayer?: unknown[] }).dataLayer)) {
      ;(window as never as { dataLayer: Record<string, unknown>[] }).dataLayer.push({
        event: 'purchase',
        ecommerce: {
          transaction_id: params.checkoutId,
          value:          params.totalAmount,
          currency:       'BRL',
          items: [{
            item_id:   params.checkoutId,
            item_name: params.productName,
            quantity:  params.qty,
            price:     params.totalAmount / Math.max(1, params.qty),
          }],
        },
      })
    }
    // Meta Pixel fbq (se presente na página via GTM ou script inline)
    const fbq = (window as never as { fbq?: (...a: unknown[]) => void }).fbq
    if (typeof fbq === 'function') {
      fbq('track', 'Purchase', {
        value:        params.totalAmount,
        currency:     'BRL',
        content_ids:  [params.checkoutId],
        content_type: 'product',
        num_items:    params.qty,
      })
    }
  } catch { /* nunca quebra o checkout */ }
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  slug:      string
  urlUtms:   Record<string, string | undefined>
  checkoutId?: string
  sellerRef?:  string
}

export function LojaClient({ slug, urlUtms, checkoutId, sellerRef }: Props) {
  const [step, setStep]         = useState<Step>('loading')
  const [product, setProduct]   = useState<ProductInfo | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  // Formulário
  const [name, setName]           = useState('')
  const [docType, setDocType]     = useState<DocType>('cpf')
  const [doc, setDoc]             = useState('')
  const [phone, setPhone]         = useState('')
  const [email, setEmail]         = useState('')
  const [qty, setQty]             = useState(1)
  const [submitting, setSubmitting] = useState(false)

  // PIX
  const [pixData, setPixData]   = useState<PixData | null>(null)
  const [copied, setCopied]     = useState(false)
  const pixelFiredRef           = useRef(false)
  const pollRef                 = useRef<ReturnType<typeof setInterval> | null>(null)
  const { secs, label: countdown } = useCountdown(pixData?.expiresAt ?? null)

  // UTMs: captura URL atual + restaura 30 dias de persistência (cookie + localStorage)
  const utmsRef = useRef<UtmData | null>(null)

  useEffect(() => {
    utmsRef.current = captureUtms()
  }, [])

  // Carrega produto
  useEffect(() => {
    fetch(`/api/loja/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setErrorMsg(data.error); setStep('error'); return }
        setProduct(data)
        setStep((prev) => (prev === 'loading' ? 'form' : prev))
      })
      .catch(() => { setErrorMsg('Erro ao carregar produto.'); setStep('error') })
  }, [slug])

  // Dispara pixel Purchase uma única vez ao entrar na tela de sucesso
  useEffect(() => {
    if (step === 'success' && pixData && !pixelFiredRef.current) {
      pixelFiredRef.current = true
      firePixelPurchase({
        checkoutId:  pixData.checkoutId,
        totalAmount: pixData.totalAmount,
        productName: pixData.title,
        qty:         pixData.qty,
      })
    }
  }, [step, pixData])

  // Polling de status
  const startPolling = useCallback((cId: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/loja/${slug}?checkoutId=${cId}`)
        const d = await r.json()
        if (d.status === 'PAID') {
          clearInterval(pollRef.current!)
          setStep('success')
        }
      } catch { /* ignora */ }
    }, 5000)
  }, [slug])

  // Restaura checkout existente (link vindo do WhatsApp)
  useEffect(() => {
    if (!checkoutId) return
    fetch(`/api/loja/${slug}?checkoutId=${checkoutId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) return
        if (data.status === 'PAID') { setStep('success'); return }
        if (data.pixCopyPaste && data.qrCodeBase64 && data.expiresAt) {
          setPixData({
            checkoutId,
            txid: '',
            pixCopyPaste: data.pixCopyPaste,
            qrCodeBase64: data.qrCodeBase64,
            expiresAt:    data.expiresAt,
            totalAmount:  Number(data.totalAmount ?? 0),
            qty:          Number(data.qty ?? 1),
            title:        data.title ?? product?.title ?? 'Checkout PIX',
          })
          setStep('pix')
          startPolling(checkoutId)
        }
      })
      .catch(() => { /* não bloqueia fluxo */ })
  }, [checkoutId, slug, product?.title, startPolling])

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  // Expiração do PIX
  useEffect(() => {
    if (step === 'pix' && secs === 0) {
      setErrorMsg('O PIX expirou. Gere um novo pedido.')
      setStep('error')
    }
  }, [secs, step])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!product) return
    setSubmitting(true)

    const waClean = phone.replace(/\D/g, '')
    const waE164  = `+55${waClean}`
    const docClean = doc.replace(/\D/g, '')

    const utmPayload = utmsRef.current ? buildUtmPayload(utmsRef.current) : {}

    const body: Record<string, unknown> = {
      name,
      whatsapp: waE164,
      email:    email || undefined,
      qty,
      sellerRef: sellerRef || undefined,
      ...utmPayload,
    }
    if (docType === 'cnpj') body.cnpj = docClean
    else                    body.cpf  = doc

    const res  = await fetch(`/api/loja/${slug}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    const data = await res.json()
    setSubmitting(false)

    if (!res.ok) { setErrorMsg(data.error ?? 'Erro ao gerar PIX.'); setStep('error'); return }

    setPixData(data)
    setStep('pix')
    startPolling(data.checkoutId)
  }

  const copyPix = async () => {
    if (!pixData) return
    await navigator.clipboard.writeText(pixData.pixCopyPaste)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  const total = product ? product.pricePerUnit * qty : 0

  // ─── Telas ────────────────────────────────────────────────────────────────

  if (step === 'loading') return (
    <main className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </main>
  )

  if (step === 'error') return (
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

  if (step === 'success') return (
    <main className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden max-w-sm w-full">
        {/* Banner verde */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-4xl">✅</span>
          </div>
          <p className="text-white font-bold text-2xl">Pagamento confirmado!</p>
          <p className="text-white/80 text-sm mt-1">PIX recebido com sucesso</p>
        </div>

        <div className="p-6 space-y-5">
          {/* Resumo */}
          <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 space-y-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Resumo do pedido</p>
            <p className="text-white text-sm font-semibold">{pixData?.title}</p>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 text-xs">{pixData?.qty} unidade(s)</span>
              <span className="text-emerald-400 font-bold text-lg">
                R$ {pixData ? pixData.totalAmount.toFixed(2).replace('.', ',') : '—'}
              </span>
            </div>
          </div>

          {/* CTA principal — Área do cliente */}
          <a
            href="/dashboard"
            className="flex items-center justify-center gap-2 w-full py-4 rounded-xl font-bold text-white text-base tracking-wide transition"
            style={{ background: 'linear-gradient(135deg, #10b981, #0ea5e9)' }}
          >
            🚀 Acessar Minha Área de Membros
          </a>

          {/* CTA secundário — WhatsApp suporte */}
          {(() => {
            const waNumber = (process.env.NEXT_PUBLIC_WA_SUPPORT_NUMBER ?? '').replace(/\D/g, '')
            if (!waNumber) return null
            const text = encodeURIComponent(
              `Olá! Acabei de confirmar o pagamento do pedido #${pixData?.checkoutId ?? ''}. Meu nome é ${name} e o produto é ${pixData?.title ?? ''}. Pode me ajudar?`
            )
            return (
              <a
                href={`https://wa.me/${waNumber}?text=${text}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-4 rounded-xl font-bold text-white text-base tracking-wide transition"
                style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Ver meu pedido no WhatsApp
              </a>
            )
          })()}

          {/* Mensagem de entrega */}
          <div className="text-center space-y-1">
            <p className="text-zinc-400 text-xs">
              Em instantes você receberá uma confirmação no WhatsApp cadastrado.
            </p>
            <p className="text-zinc-600 text-[11px]">
              Qualquer dúvida, responda a mensagem que você vai receber. 🤝
            </p>
          </div>

          {/* Logo / marca */}
          <div className="pt-2 text-center">
            <span className="text-zinc-600 text-[10px] uppercase tracking-widest">
              🛡️ Ads Ativos Global · War Room OS
            </span>
          </div>
        </div>
      </div>
    </main>
  )

  if (step === 'pix' && pixData) return (
    <main className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden max-w-sm w-full">
        {/* Header */}
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
          {/* QR Code */}
          <div className="flex flex-col items-center space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/png;base64,${pixData.qrCodeBase64}`}
              alt="QR Code PIX"
              className="w-52 h-52 rounded-xl border border-zinc-700"
            />
            <p className="text-zinc-500 text-xs">Escaneie o QR Code com seu banco</p>
          </div>

          {/* Separador */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-zinc-600 text-xs">ou copie o código</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          {/* Pix Copy & Paste */}
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

          {/* Valor */}
          <div className="bg-zinc-800/50 rounded-xl p-4 flex items-center justify-between">
            <div>
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

          {/* Status pulse */}
          <div className="flex items-center gap-2 justify-center">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-zinc-500 text-xs">Aguardando confirmação do banco...</p>
          </div>
        </div>
      </div>
    </main>
  )

  // ─── Formulário principal ─────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden max-w-sm w-full">
        {/* Badge */}
        {product?.badge && (
          <div className="flex justify-center pt-5">
            <span className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold px-4 py-1.5 rounded-full tracking-wider uppercase">
              🚀 {product.badge}
            </span>
          </div>
        )}

        {/* Cabeçalho */}
        <div className="px-6 pt-4 pb-2 text-center">
          <h1 className="text-white font-bold text-2xl leading-tight">{product?.title}</h1>
          {product && product.available > 0 && (
            <p className="text-emerald-400 text-sm font-medium mt-1">
              DISPONÍVEL: {product.available} UNIDADE{product.available !== 1 ? 'S' : ''}
            </p>
          )}
          {product && product.available === 0 && (
            <p className="text-red-400 text-sm font-medium mt-1">ESGOTADO</p>
          )}
          {product?.subtitle && (
            <p className="text-zinc-500 text-xs mt-1">{product.subtitle}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 pt-2 space-y-4">
          {/* Nome */}
          <div className="space-y-1">
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
              Nome completo
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="João da Silva"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition text-sm"
            />
          </div>

          {/* WhatsApp */}
          <div className="space-y-1">
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
              WhatsApp (receber acesso)
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="(11) 99999-9999"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition text-sm"
            />
          </div>

          {/* E-mail */}
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

          {/* Toggle CPF / CNPJ */}
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

          {/* Quantidade */}
          {product && product.maxQty > 1 && (
            <div className="space-y-1">
              <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
                Quantidade
              </label>
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
          )}

          {/* Subtotal */}
          <div className="flex items-center justify-between py-2 border-t border-zinc-800">
            <span className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Total</span>
            <span className="text-white font-bold text-2xl">
              R$ {total.toFixed(2).replace('.', ',')}
            </span>
          </div>

          {/* Botão principal */}
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

          {/* Segurança */}
          <div className="flex items-center justify-center gap-4 pt-1">
            <span className="text-zinc-600 text-[11px] flex items-center gap-1">🔒 Pagamento seguro</span>
            <span className="text-zinc-600 text-[11px] flex items-center gap-1">✅ PIX instantâneo</span>
          </div>

          {/* Cancelar */}
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
