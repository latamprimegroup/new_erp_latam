'use client'

import { useState } from 'react'
import { CheckCircle2, Copy, Eye, EyeOff, Shield, ShieldAlert } from 'lucide-react'
import type { MagicLinkWithPayload } from '@/lib/delivery-magic-link'

export function EntregaClient({ link }: { link: MagicLinkWithPayload }) {
  const { checkout, credential } = link

  const now = new Date()
  const inWarranty = checkout.warrantyEndsAt ? new Date(checkout.warrantyEndsAt) > now : false

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-emerald-400 font-bold text-sm tracking-wide">🛡️ ADS ATIVOS</p>
            <p className="text-zinc-500 text-xs">Portal de Entrega Segura</p>
          </div>
          {inWarranty ? (
            <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 text-xs font-semibold">Em Garantia</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1">
              <ShieldAlert className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-zinc-500 text-xs">Garantia expirada</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-6">

        {/* Card do pedido */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="font-bold text-white">{checkout.listing.title}</p>
              <p className="text-zinc-400 text-sm">Olá, {checkout.buyerName}! Sua entrega está pronta.</p>
            </div>
          </div>

          {checkout.warrantyEndsAt && (
            <div className={`rounded-lg px-3 py-2 text-xs ${inWarranty ? 'bg-emerald-500/5 border border-emerald-500/20 text-emerald-400' : 'bg-zinc-800 border border-zinc-700 text-zinc-500'}`}>
              {inWarranty ? '✅' : '⏰'} Garantia válida até{' '}
              {new Date(checkout.warrantyEndsAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
            </div>
          )}
        </div>

        {/* Credenciais */}
        {credential ? (
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900/60 p-5 space-y-4">
            <h2 className="font-bold text-white flex items-center gap-2">
              🔐 Dados de Acesso
            </h2>
            <div className="space-y-2">
              <CredField label="Login / E-mail da conta"   value={credential.loginEmail} />
              <CredField label="Senha"                     value={credential.loginPassword} sensitive />
              <CredField label="E-mail de Recuperação"     value={credential.recoveryEmail} />
              <CredField label="Seed 2FA (TOTP)"           value={credential.twoFaSeed} sensitive />
            </div>

            {credential.extraData && typeof credential.extraData === 'object' && Object.keys(credential.extraData).length > 0 && (
              <div className="rounded-lg bg-zinc-800 border border-zinc-700 p-3 space-y-1">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wide">Dados Adicionais</p>
                {Object.entries(credential.extraData as Record<string, unknown>).map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-xs">
                    <span className="text-zinc-500 shrink-0 capitalize">{k}:</span>
                    <span className="text-zinc-300 font-mono break-all">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-700 p-6 text-center space-y-2">
            <p className="text-zinc-500 text-sm">As credenciais serão disponibilizadas em breve.</p>
            <p className="text-zinc-600 text-xs">Entre em contato com o suporte se precisar de ajuda.</p>
          </div>
        )}

        {/* Instruções de uso seguro */}
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-3">
          <h3 className="font-semibold text-amber-400 text-sm flex items-center gap-2">
            ⚠️ Instruções para Acesso Seguro
          </h3>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li className="flex gap-2">
              <span className="text-amber-500 shrink-0">1.</span>
              <span>Use sempre um <strong className="text-white">proxy dedicado</strong> ou perfil do Dolphin/AdsPower antes de logar.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-amber-500 shrink-0">2.</span>
              <span><strong className="text-white">Não acesse</strong> a conta no modo incógnito comum ou em IPs residenciais sem proxy.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-amber-500 shrink-0">3.</span>
              <span>Salve o seed 2FA no seu autenticador <strong className="text-white">antes</strong> de fazer qualquer alteração na conta.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-amber-500 shrink-0">4.</span>
              <span>Em caso de problema, entre em contato <strong className="text-white">imediatamente</strong> pelo WhatsApp do suporte.</span>
            </li>
          </ul>
        </div>

        {/* Rodapé */}
        <div className="text-center space-y-1 pb-4">
          <p className="text-zinc-600 text-xs">Este link é exclusivo para {checkout.buyerName}.</p>
          <p className="text-zinc-700 text-xs">Ads Ativos — War Room OS · © {new Date().getFullYear()}</p>
        </div>

      </main>
    </div>
  )
}

// ─── Campo de credencial com toggle e cópia ────────────────────────────────

function CredField({
  label,
  value,
  sensitive = false,
}: {
  label:    string
  value:    string | null | undefined
  sensitive?: boolean
}) {
  const [visible, setVisible] = useState(!sensitive)
  const [copied, setCopied]   = useState(false)

  if (!value) return null

  const display = sensitive && !visible ? '•'.repeat(Math.min(value.length, 16)) : value

  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2.5 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</p>
        <p className="text-sm text-zinc-100 font-mono truncate">{display}</p>
      </div>
      <div className="flex gap-1.5 shrink-0">
        {sensitive && (
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="p-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-400"
          >
            {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          className="p-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-400"
        >
          {copied
            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            : <Copy className="w-3.5 h-3.5" />
          }
        </button>
      </div>
    </div>
  )
}
