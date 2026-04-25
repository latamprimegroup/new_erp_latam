'use client'

/**
 * PaywallGate — Tela de Acesso Bloqueado por Inadimplência
 *
 * Exibida quando a assinatura está PAST_DUE ou CANCELLED.
 * Exibe o PIX pendente (se gerado pelo billing-cron) e opções de pagamento.
 */
import { useState, useEffect } from 'react'
import { BRAND } from '@/lib/brand'

interface Props {
  planName: string
}

type PendingPix = {
  pixCopyPaste: string | null
  lastPixExpiresAt: string | null
  amount: number
  planName: string
}

export function PaywallGate({ planName }: Props) {
  const [pix, setPix]       = useState<PendingPix | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/cliente/pending-subscription')
      .then((r) => r.json())
      .then((d) => { setPix(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function copyPix() {
    if (!pix?.pixCopyPaste) return
    await navigator.clipboard.writeText(pix.pixCopyPaste).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  const support = `https://wa.me/${BRAND.supportWA}?text=${encodeURIComponent(`Olá! Preciso reativar minha assinatura ${planName}`)}`

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">

        {/* Ícone de bloqueio */}
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-red-600/15 border border-red-600/30 flex items-center justify-center">
            <span className="text-4xl">🔒</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Acesso Temporariamente Bloqueado</h1>
            <p className="text-zinc-400 text-sm mt-1">
              Sua assinatura <strong className="text-white">{planName}</strong> está com pagamento pendente.
            </p>
          </div>
        </div>

        {/* PIX pendente */}
        {loading ? (
          <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/70 p-5 text-center">
            <p className="text-zinc-500 text-sm animate-pulse">Carregando dados de pagamento…</p>
          </div>
        ) : pix?.pixCopyPaste ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-600/5 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-amber-400 uppercase tracking-wide">
                📲 PIX Gerado Automaticamente
              </p>
              {pix.lastPixExpiresAt && (
                <p className="text-xs text-zinc-500">
                  Vence: {new Date(pix.lastPixExpiresAt).toLocaleDateString('pt-BR')}
                </p>
              )}
            </div>

            <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 p-3">
              <p className="text-xs font-mono text-zinc-300 break-all leading-relaxed">
                {pix.pixCopyPaste.slice(0, 80)}…
              </p>
            </div>

            <button
              onClick={copyPix}
              className={`w-full rounded-xl py-3 font-bold text-sm transition ${
                copied
                  ? 'bg-green-600 text-white'
                  : 'bg-amber-500 hover:bg-amber-400 text-black'
              }`}
            >
              {copied ? '✅ Copiado!' : '📋 Copiar PIX Copia e Cola'}
            </button>

            {pix.amount > 0 && (
              <p className="text-center text-sm text-zinc-400">
                Valor:{' '}
                <strong className="text-white">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pix.amount)}
                </strong>
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/70 p-5 space-y-3 text-center">
            <p className="text-zinc-400 text-sm">
              Nenhum PIX gerado ainda. Nossa equipe entrará em contato em breve,
              ou você pode entrar no suporte para regularizar agora.
            </p>
          </div>
        )}

        {/* Ações */}
        <div className="space-y-3">
          <a
            href={support}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 transition"
          >
            <span>💬</span>
            <span>Regularizar via WhatsApp</span>
          </a>

          <button
            onClick={() => window.location.reload()}
            className="w-full rounded-xl border border-zinc-700 text-zinc-400 hover:bg-zinc-800 py-3 text-sm font-semibold transition"
          >
            ↻ Atualizar status de pagamento
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-zinc-700">
          🛡️ {BRAND.name} · Suporte disponível 24/7
        </p>
      </div>
    </div>
  )
}
