'use client'

/**
 * ProfileSelector — Seletor de Perfil Multi-Acesso
 *
 * Exibido quando o cliente possui mais de um perfil comprado.
 * Após a seleção, grava o perfil ativo no cookie `selected_profile`
 * e recarrega o layout para aplicar o tema correto.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PROFILE_THEMES, type ClientProfileType } from '@/lib/client-profile-config'
import { BRAND } from '@/lib/brand'

interface Props {
  /** Todos os perfis que o cliente possui */
  ownedProfiles: ClientProfileType[]
  /** Perfil atualmente ativo (primary) */
  currentProfile: ClientProfileType
  /** Nome do cliente para personalização */
  clientName?: string | null
}

export function ProfileSelector({ ownedProfiles, currentProfile, clientName }: Props) {
  const router   = useRouter()
  const [loading, setLoading] = useState<ClientProfileType | null>(null)

  async function selectProfile(profileType: ClientProfileType) {
    setLoading(profileType)
    try {
      await fetch('/api/cliente/select-profile', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ profileType }),
      })
      router.refresh()
    } catch {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
            {BRAND.name}
          </p>
          <h1 className="text-2xl font-bold text-white">
            Olá{clientName ? `, ${clientName.split(' ')[0]}` : ''}! Qual área deseja acessar?
          </h1>
          <p className="text-zinc-400 text-sm">
            Você possui acesso a {ownedProfiles.length} áreas exclusivas. Escolha abaixo.
          </p>
        </div>

        {/* Cards de perfil */}
        <div className="grid gap-4 sm:grid-cols-2">
          {ownedProfiles.map((profileType) => {
            const theme     = PROFILE_THEMES[profileType]
            const isActive  = profileType === currentProfile
            const isLoading = loading === profileType

            return (
              <button
                key={profileType}
                type="button"
                onClick={() => selectProfile(profileType)}
                disabled={!!loading}
                className={`relative group rounded-2xl border-2 p-5 text-left transition-all disabled:opacity-60 ${
                  isActive
                    ? 'border-white/30 bg-zinc-800/80'
                    : 'border-zinc-700/50 bg-zinc-900/60 hover:border-zinc-600 hover:bg-zinc-800/60'
                }`}
                style={isActive ? { borderColor: theme.accentHex } : undefined}
              >
                {/* Gradiente de fundo */}
                <div
                  className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${theme.headerGradient} opacity-20 group-hover:opacity-30 transition-opacity`}
                />

                {/* Conteúdo */}
                <div className="relative space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-3xl">{theme.emoji}</span>
                      <div>
                        <p className="font-bold text-white text-base">{theme.label}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">{theme.description}</p>
                      </div>
                    </div>

                    {isActive && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                        style={{ background: theme.accentHex + '33', color: theme.accentHex }}
                      >
                        Ativo
                      </span>
                    )}
                  </div>

                  {/* Indicador visual */}
                  <div
                    className="h-1 rounded-full w-full opacity-60"
                    style={{ background: `linear-gradient(90deg, ${theme.accentHex}, transparent)` }}
                  />

                  {/* CTA */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500 font-medium">
                      Clique para entrar
                    </span>
                    {isLoading ? (
                      <span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                    ) : (
                      <span className="text-zinc-400 text-sm group-hover:text-white transition">→</span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-zinc-700">
          🛡️ {BRAND.name} · War Room OS
        </p>
      </div>
    </div>
  )
}
