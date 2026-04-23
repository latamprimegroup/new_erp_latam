'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import {
  ShieldCheck, Loader2, CheckCircle2, Copy, CheckCheck,
  AlertCircle, Clock, Zap, Lock,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AssetInfo {
  adsId:       string
  displayName: string
  salePrice:   number
  description: string
  tags:        string
  specs:       Record<string, unknown>
}

type UtmMap = Record<string, string | undefined>

interface CheckoutClientProps {
  asset: AssetInfo
  utms:  UtmMap
}

// ─── UTM localStorage ─────────────────────────────────────────────────────────

const UTM_KEYS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','src'] as const
const LS_KEY   = 'ads_utms'

/** Persiste UTMs no localStorage para sobreviver a redirecionamentos */
function persistUtms(utms: UtmMap) {
  try {
    const toSave: UtmMap = {}
    for (const k of UTM_KEYS) if (utms[k]) toSave[k] = utms[k]
    if (Object.keys(toSave).length > 0)
      localStorage.setItem(LS_KEY, JSON.stringify({ ...toSave, _savedAt: Date.now() }))
  } catch { /* SSR / privado */ }
}

/** Restaura UTMs do localStorage (válidos por 24h) */
function restoreUtms(): UtmMap {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw) as UtmMap & { _savedAt?: number }
    if (data._savedAt && Date.now() - (data._savedAt as number) > 86_400_000) {
      localStorage.removeItem(LS_KEY)
      return {}
    }
    return data
  } catch { return {} }
}

/** Mescla UTMs da URL (prioridade) com os do localStorage */
function mergeUtms(fromUrl: UtmMap): UtmMap {
  const saved = restoreUtms()
  const merged: UtmMap = { ...saved }
  for (const k of UTM_KEYS) if (fromUrl[k]) merged[k] = fromUrl[k]
  return merged
}

type Step = 'form' | 'pix' | 'success'

interface PixData {
  checkoutId:   string
  txid:         string
  pixCopyPaste: string
  qrCodeBase64: string
  expiresAt:    string
  amount:       number
  displayName:  string
}

// ─── Formatadores ─────────────────────────────────────────────────────────────

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function formatCPF(v: string) {
  return v.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4').slice(0, 14)
}

function formatPhone(v: string) {
  const d = v.replace(/\D/g, '')
  if (d.length <= 2)  return `+${d}`
  if (d.length <= 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4)}`
  return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9, 13)}`
}

function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState<number>(0)

  useEffect(() => {
    if (!expiresAt) return
    const target = new Date(expiresAt).getTime()
    const tick = () => setRemaining(Math.max(0, target - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  const mm = String(Math.floor(remaining / 60000)).padStart(2, '0')
  const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')
  return { label: `${mm}:${ss}`, expired: remaining === 0 }
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CheckoutClient({ asset, utms: utmsFromUrl }: CheckoutClientProps) {
  const [step, setStep]       = useState<Step>('form')
  const [pixData, setPixData] = useState<PixData | null>(null)
  const [copied, setCopied]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [polling, setPolling] = useState(false)

  // UTMs mesclados (URL tem prioridade; localStorage como fallback)
  const utmsRef = useRef<UtmMap>({})

  useEffect(() => {
    const merged = mergeUtms(utmsFromUrl)
    utmsRef.current = merged
    if (Object.keys(utmsFromUrl).some((k) => utmsFromUrl[k])) {
      persistUtms(merged)
    }
  }, [utmsFromUrl])

  // Campos do formulário
  const [name, setName]         = useState('')
  const [cpf, setCpf]           = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail]       = useState('')

  const { label: countdown, expired } = useCountdown(pixData?.expiresAt ?? null)

  // ── Gerar PIX ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const waRaw  = whatsapp.replace(/\D/g, '')
    const waE164 = waRaw.startsWith('55') ? `+${waRaw}` : `+55${waRaw}`
    const utms   = utmsRef.current

    const res = await fetch('/api/checkout/pix', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adsId:    asset.adsId,
        name:     name.trim(),
        cpf:      cpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
        whatsapp: waE164,
        email:    email || undefined,
        ...utms,
      }),
    })

    if (res.ok) {
      const data = await res.json() as PixData
      setPixData(data)
      setStep('pix')
    } else {
      const err = await res.json().catch(() => ({})) as { error?: string }
      setError(err.error ?? 'Erro ao gerar PIX. Tente novamente.')
    }
    setLoading(false)
  }

  // ── Polling de status ───────────────────────────────────────────────────────
  const checkStatus = useCallback(async () => {
    if (!pixData?.checkoutId || polling) return
    setPolling(true)
    const res = await fetch(`/api/checkout/pix?id=${pixData.checkoutId}`)
    if (res.ok) {
      const data = await res.json() as { status: string }
      if (data.status === 'PAID') setStep('success')
    }
    setPolling(false)
  }, [pixData, polling])

  useEffect(() => {
    if (step !== 'pix') return
    const id = setInterval(checkStatus, 5000)
    return () => clearInterval(id)
  }, [step, checkStatus])

  // ── Copiar PIX ──────────────────────────────────────────────────────────────
  const copyPix = async () => {
    if (!pixData?.pixCopyPaste) return
    await navigator.clipboard.writeText(pixData.pixCopyPaste)
    setCopied(true)
    setTimeout(() => setCopied(false), 4000)
  }

  // ─── Specs resumo ──────────────────────────────────────────────────────────
  const specs = asset.specs
  const specItems = [
    specs.year        && `🍷 Safra ${specs.year}`,
    specs.faturamento && `✅ ${specs.faturamento}`,
    specs.pagamento   && `⚙️ Pag. ${specs.pagamento}`,
    specs.verificacao && `🔐 ${specs.verificacao}`,
    specs.aquecimento && `🔥 Aquec. ${specs.aquecimento}`,
  ].filter(Boolean) as string[]

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-zinc-800/60 border border-zinc-700 rounded-2xl px-4 py-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span className="text-white font-bold tracking-wide text-sm">ADS ATIVOS</span>
            <span className="text-zinc-400 text-xs">War Room OS</span>
          </div>
        </div>

        {/* Card do ativo */}
        <div className="rounded-2xl border border-zinc-700 bg-zinc-900/80 backdrop-blur p-5 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-zinc-400 text-xs font-mono mb-1">{asset.adsId}</p>
              <h2 className="text-white font-bold text-base leading-snug">{asset.displayName}</h2>
              {specItems.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {specItems.map((s, i) => (
                    <span key={i} className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full border border-zinc-700">{s}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-zinc-400 text-xs">Valor</p>
              <p className="text-emerald-400 font-bold text-2xl">{brl(asset.salePrice)}</p>
            </div>
          </div>
        </div>

        {/* ── STEP: Formulário ─────────────────────────────────────────────── */}
        {step === 'form' && (
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900/80 backdrop-blur p-5">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" />
              Seus dados para o PIX
            </h3>

            {error && (
              <div className="mb-4 rounded-xl bg-red-950/30 border border-red-800 p-3 text-sm text-red-400 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1">Nome completo *</label>
                <input
                  required value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="João da Silva"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                />
              </div>
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1">CPF *</label>
                <input
                  required value={cpf}
                  onChange={(e) => setCpf(formatCPF(e.target.value))}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                />
              </div>
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1">WhatsApp *</label>
                <input
                  required value={whatsapp}
                  onChange={(e) => setWhatsapp(formatPhone(e.target.value))}
                  placeholder="+55 11 99999-9999"
                  inputMode="tel"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                />
                <p className="text-zinc-500 text-[10px] mt-1">O acesso será enviado para este número após o pagamento</p>
              </div>
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1">E-mail (opcional)</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="joao@email.com"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                />
              </div>

              <button
                type="submit" disabled={loading}
                className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-base transition-colors flex items-center justify-center gap-2 mt-2"
              >
                {loading
                  ? <><Loader2 className="w-5 h-5 animate-spin" />Gerando PIX...</>
                  : <><Zap className="w-5 h-5" />Gerar PIX — {brl(asset.salePrice)}</>}
              </button>
            </form>

            <p className="text-center text-zinc-600 text-[10px] mt-4 flex items-center justify-center gap-1">
              <Lock className="w-3 h-3" />
              Dados protegidos · Pagamento via Banco Inter
            </p>
          </div>
        )}

        {/* ── STEP: PIX gerado ─────────────────────────────────────────────── */}
        {step === 'pix' && pixData && (
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900/80 backdrop-blur p-5 space-y-5">
            <div className="text-center">
              <h3 className="text-white font-bold text-lg">PIX gerado!</h3>
              <p className="text-zinc-400 text-sm">Escaneie o QR Code ou copie o código PIX</p>
            </div>

            {/* Countdown */}
            <div className={`flex items-center justify-center gap-2 text-sm font-mono font-bold ${expired ? 'text-red-400' : 'text-amber-400'}`}>
              <Clock className="w-4 h-4" />
              {expired ? 'PIX expirado — recarregue a página' : `Expira em ${countdown}`}
            </div>

            {/* QR Code */}
            {pixData.qrCodeBase64 && (
              <div className="flex justify-center">
                <div className="bg-white rounded-xl p-3">
                  <Image
                    src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                    alt="QR Code PIX"
                    width={200} height={200}
                    className="w-48 h-48"
                  />
                </div>
              </div>
            )}

            {/* Copia e cola */}
            <div className="space-y-2">
              <label className="text-zinc-400 text-xs font-semibold block">PIX Copia e Cola</label>
              <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-3 text-xs font-mono text-zinc-300 break-all max-h-24 overflow-y-auto">
                {pixData.pixCopyPaste}
              </div>
              <button
                onClick={copyPix}
                className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors ${
                  copied ? 'bg-emerald-600 text-white' : 'bg-zinc-700 hover:bg-zinc-600 text-white'
                }`}
              >
                {copied ? <><CheckCheck className="w-4 h-4" />Copiado!</> : <><Copy className="w-4 h-4" />Copiar código PIX</>}
              </button>
            </div>

            {/* Status polling */}
            <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Aguardando confirmação do pagamento...
            </div>

            <div className="rounded-xl bg-blue-950/30 border border-blue-800/50 p-3 text-xs text-blue-300">
              <p className="font-semibold mb-1">✅ Após o pagamento:</p>
              <p>O acesso ao ativo será enviado automaticamente para o seu WhatsApp em poucos minutos.</p>
            </div>
          </div>
        )}

        {/* ── STEP: Sucesso ────────────────────────────────────────────────── */}
        {step === 'success' && (
          <div className="rounded-2xl border border-emerald-700 bg-emerald-950/20 backdrop-blur p-6 space-y-4 text-center">
            <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto" />
            <h3 className="text-white font-bold text-xl">Pagamento confirmado!</h3>
            <p className="text-emerald-300 text-sm">
              Seu PIX foi recebido com sucesso. O acesso ao ativo será enviado agora para o seu WhatsApp.
            </p>
            <div className="bg-zinc-800/60 border border-zinc-700 rounded-xl p-4 text-left space-y-1 text-sm">
              <p className="text-zinc-400">Ativo adquirido:</p>
              <p className="text-white font-bold">{asset.displayName}</p>
              <p className="text-zinc-500 font-mono text-xs">{asset.adsId}</p>
              <p className="text-emerald-400 font-bold text-lg mt-2">{brl(asset.salePrice)}</p>
            </div>
            <p className="text-zinc-500 text-xs">
              Não recebeu o acesso em 10 minutos? Entre em contato com nosso suporte.
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
