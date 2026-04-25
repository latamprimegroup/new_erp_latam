'use client'

/**
 * DashboardWrapper — Motor de RBAC Visual por Perfil de Cliente
 *
 * Aplica o tema correto (Mentorado=Ouro, Infra=Tech, etc.) e
 * expõe o contexto de módulos via ClientProfileContext.
 */
import React, { createContext, useContext, useMemo } from 'react'
import Link from 'next/link'
import {
  type ClientProfileType,
  type ModuleDef,
  PROFILE_THEMES,
  resolveClientModules,
} from '@/lib/client-profile-config'

// ─── Contexto de perfil ───────────────────────────────────────────────────────

type ProfileContextValue = {
  profileType:   ClientProfileType
  activeModules: ModuleDef[]
  theme:         typeof PROFILE_THEMES[ClientProfileType]
  hasModule:     (key: string) => boolean
  /** Se true, CEO está visualizando como outro perfil */
  isGodView:     boolean
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function useClientProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useClientProfile must be used inside DashboardWrapper')
  return ctx
}

// ─── Wrapper principal ────────────────────────────────────────────────────────

interface Props {
  profileType:   string
  customModules: string[]
  isGodView?:    boolean
  godViewLabel?: string
  children:      React.ReactNode
}

export function DashboardWrapper({
  profileType: rawProfile,
  customModules,
  isGodView = false,
  godViewLabel,
  children,
}: Props) {
  const profileType = (rawProfile ?? 'TRADER_WHATSAPP') as ClientProfileType
  const theme       = PROFILE_THEMES[profileType] ?? PROFILE_THEMES.TRADER_WHATSAPP
  const modules     = useMemo(
    () => resolveClientModules(profileType, customModules),
    [profileType, customModules],
  )

  const value = useMemo<ProfileContextValue>(() => ({
    profileType,
    activeModules: modules,
    theme,
    hasModule: (key: string) => modules.some((m) => m.key === key),
    isGodView,
  }), [profileType, modules, theme, isGodView])

  return (
    <ProfileContext.Provider value={value}>
      {/* CSS variables do tema — injetadas no wrapper para cascata de estilos */}
      <style>{`
        .${theme.themeClass} {
          --profile-accent: ${theme.accentHex};
          --profile-accent-rgb: ${hexToRgb(theme.accentHex)};
        }
      `}</style>

      <div className={theme.themeClass}>
        {/* Banner God View (CEO impersonation) */}
        {isGodView && (
          <div className="sticky top-0 z-[80] bg-yellow-400 text-yellow-900 text-xs font-bold text-center py-1.5 px-4 flex items-center justify-center gap-3">
            <span>👁️ GOD VIEW — Visualizando como: {godViewLabel ?? profileType}</span>
            <Link
              href="/dashboard/ceo"
              className="underline hover:no-underline text-yellow-900"
            >
              Sair da visualização →
            </Link>
          </div>
        )}

        {/* Badge de perfil no topo da área do cliente */}
        <ProfileBadge theme={theme} />

        {children}

        {/* Nav de módulos horizontal (mobile-friendly) */}
        <ProfileModuleNav modules={modules} />
      </div>
    </ProfileContext.Provider>
  )
}

// ─── Badge de perfil ──────────────────────────────────────────────────────────

function ProfileBadge({ theme }: { theme: typeof PROFILE_THEMES[ClientProfileType] }) {
  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 bg-gradient-to-r ${theme.headerGradient} border-b border-white/5`}
    >
      <span className="text-lg">{theme.emoji}</span>
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-white/60">Área</p>
        <p className="text-sm font-bold text-white leading-none">{theme.label}</p>
      </div>
      <p className="ml-auto text-[11px] text-white/40 hidden sm:block">{theme.description}</p>
    </div>
  )
}

// ─── Nav de módulos horizontal ────────────────────────────────────────────────

function ProfileModuleNav({ modules }: { modules: ModuleDef[] }) {
  if (modules.length === 0) return null
  return (
    <nav className="sticky top-0 z-40 overflow-x-auto border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="flex gap-1 px-3 py-1.5 min-w-max">
        {modules.map((mod) => (
          <Link
            key={mod.key}
            href={mod.path}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white transition whitespace-nowrap"
          >
            <span>{mod.icon}</span>
            {mod.label}
            {mod.badge && (
              <span className="rounded bg-violet-600 px-1 py-0.5 text-[9px] font-bold text-white uppercase">
                {mod.badge}
              </span>
            )}
          </Link>
        ))}
      </div>
    </nav>
  )
}

// ─── Componente de guarda de módulo ──────────────────────────────────────────

/**
 * Envolve conteúdo que só deve ser renderizado se o cliente
 * tiver acesso ao módulo especificado.
 */
export function ModuleGate({
  moduleKey,
  fallback = null,
  children,
}: {
  moduleKey: string
  fallback?: React.ReactNode
  children:  React.ReactNode
}) {
  const { hasModule } = useClientProfile()
  return hasModule(moduleKey) ? <>{children}</> : <>{fallback}</>
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r} ${g} ${b}`
}
