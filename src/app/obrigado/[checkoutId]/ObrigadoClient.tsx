'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Copy, ExternalLink, Gift, Share2, Shield, Timer } from 'lucide-react'

const BRLC = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })
const UPSELL_TIMER_MIN = 15  // minutos de urgência para o upsell

interface CheckoutInfo {
  id:          string
  buyerName:   string
  totalAmount: number
  qty:         number
  warrantyEndsAt: string | null
  listing: { id: string; slug: string; title: string; assetCategory: string }
}

interface UpsellListing {
  id:    string
  slug:  string
  title: string
  price: number
  badge: string | null
}

export function ObrigadoClient({
  checkout,
  upsellListing,
}: {
  checkout:      CheckoutInfo
  upsellListing: UpsellListing | null
}) {
  const [referralUrl, setReferralUrl]   = useState<string | null>(null)
  const [couponCode, setCouponCode]     = useState<string | null>(null)
  const [referralCopied, setReferralCopied] = useState(false)
  const [secs, setSecs] = useState(UPSELL_TIMER_MIN * 60)

  // Timer de urgência
  useEffect(() => {
    if (!upsellListing) return
    const t = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [upsellListing])

  // Gera link de indicação
  useEffect(() => {
    fetch(`/api/loja/referral?checkoutId=${checkout.id}`)
      .then((r) => r.json())
      .then((d: { referralUrl?: string; couponCode?: string }) => {
        if (d.referralUrl) setReferralUrl(d.referralUrl)
        if (d.couponCode) setCouponCode(d.couponCode)
      })
      .catch(() => {})
  }, [checkout.id])

  const timerLabel = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
  const timerExpired = secs === 0

  const copyReferral = async () => {
    if (!referralUrl) return
    await navigator.clipboard.writeText(referralUrl)
    setReferralCopied(true)
    setTimeout(() => setReferralCopied(false), 2500)
  }

  const shareReferral = () => {
    if (!referralUrl) return
    const text = `Comprei minha conta de ads na Ads Ativos e tô adorando! Use meu link e ganha ${couponCode ? '10%' : 'desconto'} especial: ${referralUrl}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }

  const appBase = typeof window !== 'undefined' ? window.location.origin : ''
  const deliveryUrl = `${appBase}/loja/${checkout.listing.slug}?checkoutId=${checkout.id}`

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-8 text-center space-y-2">
        <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-9 h-9 text-white" />
        </div>
        <h1 className="text-2xl font-black text-white">Pagamento Aprovado!</h1>
        <p className="text-emerald-100 text-sm">
          Olá, {checkout.buyerName}! Seu pedido foi confirmado.
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8 space-y-5">

        {/* Resumo do pedido */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
          <h2 className="font-bold text-white">📦 Seu Pedido</h2>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Produto</span>
            <span className="text-white font-medium">{checkout.listing.title}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Quantidade</span>
            <span className="text-white">{checkout.qty} unidade(s)</span>
          </div>
          <div className="flex justify-between text-sm border-t border-zinc-800 pt-2">
            <span className="text-zinc-400">Total pago</span>
            <span className="text-emerald-400 font-bold text-lg">{BRLC.format(checkout.totalAmount)}</span>
          </div>
          {checkout.warrantyEndsAt && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-300">
              <Shield className="w-3.5 h-3.5 shrink-0" />
              Garantia válida até {new Date(checkout.warrantyEndsAt).toLocaleDateString('pt-BR')}
            </div>
          )}
        </div>

        {/* CTA Entrega */}
        <a
          href={deliveryUrl}
          className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base transition"
        >
          <ExternalLink className="w-5 h-5" />
          Acessar meu painel de entrega
        </a>

        {/* Upsell com timer */}
        {upsellListing && !timerExpired && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Timer className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-300">Oferta exclusiva pós-compra</p>
                  <p className="text-xs text-zinc-500">Válida apenas nos próximos:</p>
                </div>
              </div>
              <div className={`font-mono font-black text-2xl ${secs < 120 ? 'text-red-400' : 'text-amber-400'}`}>
                {timerLabel}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4 space-y-2">
              {upsellListing.badge && (
                <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {upsellListing.badge}
                </span>
              )}
              <p className="font-bold text-white">{upsellListing.title}</p>
              <p className="text-2xl font-black text-emerald-400">{BRLC.format(upsellListing.price)}</p>
              <p className="text-xs text-zinc-500">
                Complementa perfeitamente o ativo que você acabou de comprar.
                Clientes que adquirem 2+ ativos relatam ROAS 2-3× maior.
              </p>
            </div>

            <a
              href={`${appBase}/pay/one/new?slug=${upsellListing.slug}`}
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-900 font-black text-sm transition"
            >
              ⚡ Quero esse também — {BRLC.format(upsellListing.price)}
            </a>
          </div>
        )}

        {/* Referral — Link de Indicação */}
        {referralUrl && (
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-sm font-bold text-blue-300">Indique e seu amigo ganha desconto!</p>
                <p className="text-xs text-zinc-500">Compartilhe seu link — o indicado ganha 10% de desconto.</p>
              </div>
            </div>

            {couponCode && (
              <div className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-center">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Código do amigo</p>
                <p className="text-white font-mono font-bold tracking-widest text-lg">{couponCode}</p>
              </div>
            )}

            <div className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2">
              <p className="text-[10px] text-zinc-500 mb-1">Seu link de indicação</p>
              <p className="text-xs text-zinc-300 font-mono break-all">{referralUrl}</p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={copyReferral}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold transition"
              >
                <Copy className="w-4 h-4" />
                {referralCopied ? 'Copiado!' : 'Copiar link'}
              </button>
              <button
                onClick={shareReferral}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition"
              >
                <Share2 className="w-4 h-4" />
                WhatsApp
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-zinc-600 text-xs pb-6">
          <p>Ads Ativos — War Room OS</p>
          <p className="mt-0.5">Pedido #{checkout.id.slice(-8).toUpperCase()}</p>
        </div>

      </div>
    </div>
  )
}
