'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'

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

type Step = 'form' | 'pix' | 'success' | 'error' | 'loading'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src'] as const
const LS_KEY   = 'ads_utms'

function persistUtms(utms: Record<string, string | undefined>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(utms)) } catch { /* noop */ }
}
function restoreUtms(): Record<string, string | undefined> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') } catch { return {} }
}
function mergeUtms(
  url: Record<string, string | undefined>,
  stored: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = { ...stored }
  for (const k of UTM_KEYS) if (url[k]) merged[k] = url[k]
  return merged
}

function formatCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
         .replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})$/, '$1.$2.$3-$4')
         .replace(/(\d{3})(\d{3})(\d{1,3})$/, '$1.$2.$3')
         .replace(/(\d{3})(\d{1,3})$/, '$1.$2')
         .replace(/(\d{1,3})$/, '$1')
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

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  slug:    string
  urlUtms: Record<string, string | undefined>
  checkoutId?: string
}

export function LojaClient({ slug, urlUtms, checkoutId }: Props) {
  const [step, setStep]       = useState<Step>('loading')
  const [product, setProduct] = useState<ProductInfo | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  // Formulário
  const [name, setName]         = useState('')
  const [cpf, setCpf]           = useState('')
  const [phone, setPhone]       = useState('')
  const [email, setEmail]       = useState('')
  const [qty, setQty]           = useState(1)
  const [submitting, setSubmitting] = useState(false)

  // PIX
  const [pixData, setPixData]   = useState<PixData | null>(null)
  const [copied, setCopied]     = useState(false)
  const pollRef                 = useRef<ReturnType<typeof setInterval> | null>(null)
  const { secs, label: countdown } = useCountdown(pixData?.expiresAt ?? null)

  // UTMs persistidos
  const utmsRef = useRef<Record<string, string | undefined>>(urlUtms)

  useEffect(() => {
    const stored = restoreUtms()
    const merged = mergeUtms(urlUtms, stored)
    utmsRef.current = merged
    persistUtms(merged)
  }, [urlUtms])

  // Carrega produto
  useEffect(() => {
    fetch(`/api/loja/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setErrorMsg(data.error); setStep('error'); return }
        setProduct(data)
        setStep('form')
      })
      .catch(() => { setErrorMsg('Erro ao carregar produto.'); setStep('error') })
  }, [slug])

  // Polling de status
  const startPolling = useCallback((checkoutId: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/loja/${slug}?checkoutId=${checkoutId}`)
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
        if (data.status === 'PAID') {
          setStep('success')
          return
        }
        if (data.pixCopyPaste && data.qrCodeBase64 && data.expiresAt) {
          setPixData({
            checkoutId,
            txid: '',
            pixCopyPaste: data.pixCopyPaste,
            qrCodeBase64: data.qrCodeBase64,
            expiresAt: data.expiresAt,
            totalAmount: Number(data.totalAmount ?? 0),
            qty: Number(data.qty ?? 1),
            title: data.title ?? product?.title ?? 'Checkout PIX',
          })
          setStep('pix')
          startPolling(checkoutId)
        }
      })
      .catch(() => {
        // não bloqueia fluxo principal se consulta falhar
      })
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

    const res = await fetch(`/api/loja/${slug}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        cpf,
        whatsapp: waE164,
        email:    email || undefined,
        qty,
        ...utmsRef.current,
      }),
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
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-sm w-full text-center space-y-6">
        <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
          <span className="text-4xl">✅</span>
        </div>
        <div>
          <p className="text-white font-bold text-2xl">Pagamento confirmado!</p>
          <p className="text-zinc-400 text-sm mt-2">
            Olá <span className="text-white font-medium">{name}</span>! Seu PIX foi recebido com sucesso.
          </p>
        </div>
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 text-left space-y-2">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Resumo do pedido</p>
          <p className="text-white text-sm font-medium">{pixData?.title}</p>
          <p className="text-zinc-400 text-sm">{pixData?.qty}x unidade(s)</p>
          <p className="text-emerald-400 font-bold text-lg">
            R$ {pixData ? pixData.totalAmount.toFixed(2) : '—'}
          </p>
        </div>
        <p className="text-zinc-500 text-xs">
          Nossa equipe entrará em contato no seu WhatsApp em instantes com os acessos. 🚀
        </p>
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
            <p className="text-white font-bold text-lg">{pixData.title}</p>
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
              className="w-48 h-48 rounded-xl border border-zinc-700"
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
            className={`w-full py-3 rounded-xl border text-sm font-medium transition flex items-center justify-center gap-2 ${
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
                R$ {pixData.totalAmount.toFixed(2)}
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
          <h1 className="text-white font-bold text-2xl">{product?.title}</h1>
          {product && (
            <p className="text-emerald-400 text-sm font-medium mt-1">
              DISPONÍVEL: {product.available} UNIDADE{product.available !== 1 ? 'S' : ''}
            </p>
          )}
          {product?.subtitle && (
            <p className="text-zinc-500 text-xs mt-1">{product.subtitle}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 pt-2 space-y-4">
          {/* WhatsApp */}
          <div className="space-y-1">
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
              Seu WhatsApp (receber acesso)
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="(91) 99999-9999"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition text-sm"
            />
          </div>

          {/* CPF */}
          <div className="space-y-1">
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
              Seu CPF (para o PIX)
            </label>
            <input
              type="text"
              required
              value={cpf}
              onChange={(e) => setCpf(formatCpf(e.target.value))}
              placeholder="000.000.000-00"
              inputMode="numeric"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition text-sm"
            />
          </div>

          {/* Nome */}
          <div className="space-y-1">
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
              Seu nome completo
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

          {/* Email (opcional) */}
          <div className="space-y-1">
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
              E-mail <span className="text-zinc-600 normal-case">(opcional)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition text-sm"
            />
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
            <span className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Subtotal</span>
            <span className="text-white font-bold text-2xl">
              R$ {total.toFixed(2).replace('.', ',')}
            </span>
          </div>

          {/* Botão */}
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
              'PAGAR COM PIX'
            )}
          </button>

          {/* Cancelar */}
          <button
            type="button"
            onClick={() => window.history.back()}
            className="w-full py-2 text-zinc-500 text-sm hover:text-zinc-300 transition"
          >
            CANCELAR
          </button>
        </form>
      </div>
    </main>
  )
}
