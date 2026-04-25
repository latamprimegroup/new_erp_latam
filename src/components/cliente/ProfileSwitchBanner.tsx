'use client'

/**
 * ProfileSwitchBanner — Banner discreto no topo para trocar de perfil
 *
 * Exibido quando o cliente já selecionou um perfil mas possui outros disponíveis.
 * Permite alternar entre áreas sem sair do painel.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PROFILE_THEMES, type ClientProfileType } from '@/lib/client-profile-config'

interface Props {
  ownedProfiles:  ClientProfileType[]
  currentProfile: ClientProfileType
  clientName?:    string | null
}

export function ProfileSwitchBanner({ ownedProfiles, currentProfile, clientName }: Props) {
  const router          = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const theme           = PROFILE_THEMES[currentProfile]

  async function switchTo(profileType: ClientProfileType) {
    if (profileType === currentProfile) { setOpen(false); return }
    setBusy(true)
    await fetch('/api/cliente/select-profile', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ profileType }),
    }).catch(() => {})
    router.refresh()
  }

  return (
    <div className="relative mb-4">
      {/* Barra de perfil ativo */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between rounded-xl border border-zinc-700/50 bg-zinc-900/70 px-4 py-2.5 text-sm transition hover:border-zinc-600"
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">{theme.emoji}</span>
          <span className="font-semibold text-white">{theme.label}</span>
          <span
            className="hidden sm:inline rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
            style={{ background: theme.accentHex + '22', color: theme.accentHex }}
          >
            Área Ativa
          </span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500">
          <span className="text-xs hidden sm:inline">Trocar de área</span>
          <span className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▾</span>
        </div>
      </button>

      {/* Dropdown de seleção */}
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-zinc-700/60 bg-zinc-900 shadow-2xl overflow-hidden">
          {ownedProfiles.map((pType) => {
            const t       = PROFILE_THEMES[pType]
            const isCur   = pType === currentProfile
            return (
              <button
                key={pType}
                onClick={() => switchTo(pType)}
                disabled={busy}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-800/70 disabled:opacity-50 ${
                  isCur ? 'bg-zinc-800/50' : ''
                }`}
              >
                <span className="text-lg">{t.emoji}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{t.label}</p>
                  <p className="text-xs text-zinc-500">{t.description}</p>
                </div>
                {isCur && (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                    style={{ background: t.accentHex + '22', color: t.accentHex }}
                  >
                    Ativo
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
