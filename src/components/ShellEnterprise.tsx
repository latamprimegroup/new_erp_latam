'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  PanelLeftClose,
  PanelLeft,
  Search,
  LogOut,
  Menu,
  Siren,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { CommandPalette } from './CommandPalette'
import { ThemeToggle } from './ThemeToggle'
import { NotificationsBell } from './NotificationsBell'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ClientHeaderGamification } from './cliente/ClientHeaderGamification'
import { ClientPatenteLevelUp } from './cliente/ClientPatenteLevelUp'
import { useDashboardI18n } from '@/contexts/DashboardI18nContext'
import { getModulesForRole, getActiveNavHref } from '@/lib/nav-modules'
import { getNavIcon } from '@/lib/nav-icons'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  PRODUCER: 'Produção',
  DELIVERER: 'Entregas',
  FINANCE: 'Financeiro',
  COMMERCIAL: 'Vendas',
  CLIENT: 'Cliente',
  MANAGER: 'Gestor',
  PLUG_PLAY: 'Plug & Play',
  PRODUCTION_MANAGER: 'Gerente produção',
}

export function ShellEnterprise({
  user,
  children,
}: {
  user: { name?: string | null; email?: string | null; role?: string; cargo?: string | null }
  children: React.ReactNode
}) {
  const { t } = useDashboardI18n()
  const pathname = usePathname()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  // Guard de hidratação: framer-motion AnimatePresence só é ativado após o mount
  // para evitar React Error #418 (mismatch server/client com key={pathname})
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const modules = getModulesForRole(user.role, user.cargo)

  return (
    <div className="min-h-screen flex bg-ads-grey-pale dark:bg-ads-navy">
      {user.role === 'CLIENT' ? <ClientPatenteLevelUp /> : null}
      <CommandPalette userRole={user.role} userCargo={user.cargo ?? null} />

      {/* Sidebar: light = fundo claro | dark = navy + quarter-circle */}
      <aside
        className={`fixed lg:relative inset-y-0 left-0 z-40 flex flex-col h-screen bg-white dark:bg-ads-navy border-r border-gray-200 dark:border-white/10 transition-all duration-300 overflow-hidden ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Quarter-circle apenas no dark */}
        <div className="absolute top-0 left-0 w-24 h-24 bg-primary-500 rounded-br-full opacity-20 pointer-events-none hidden dark:block" />
        <div className="relative flex shrink-0 items-center justify-between p-4 border-b border-gray-200 dark:border-white/10 min-h-[57px]">
          <Link href="/dashboard" className="flex items-center justify-center lg:justify-start truncate flex-1 min-w-0">
            {sidebarCollapsed ? (
              <>
                <Image src="/logos/ads-azul-ativos-branco.png" alt="ADS" width={40} height={40} className="h-8 w-auto object-contain dark:hidden" />
                <Image src="/logos/ads-branco-ativos-branco.png" alt="ADS" width={40} height={40} className="h-8 w-auto object-contain hidden dark:block" />
              </>
            ) : (
              <>
                <Image src="/logos/ads-azul-ativos-branco.png" alt="ADS Ativos" width={120} height={36} className="h-9 w-auto object-contain dark:hidden" />
                <Image src="/logos/ads-branco-ativos-branco.png" alt="ADS Ativos" width={120} height={36} className="h-9 w-auto object-contain hidden dark:block" />
              </>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 rounded-lg text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 lg:flex hidden"
            aria-label={sidebarCollapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
          >
            {sidebarCollapsed ? <PanelLeft className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>
        </div>

        <nav className="flex-1 min-h-0 p-3 overflow-y-auto space-y-1 scrollbar-ads">
          {(() => {
            const activeHref = getActiveNavHref(pathname, modules)
            return modules.map((m) => {
              const isActive = m.href === activeHref
              return (
              <Link
                key={m.href}
                href={m.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-100 dark:bg-primary-500 text-primary-700 dark:text-white shadow-lg dark:shadow-lg'
                    : 'text-gray-700 dark:text-white/85 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {(() => {
                  const Icon = getNavIcon(m.icon)
                  return <Icon className="w-4 h-4 shrink-0" />
                })()}
                {!sidebarCollapsed && (
                  <span className="truncate">{m.labelKey ? t(m.labelKey) : m.label}</span>
                )}
              </Link>
            )
            })
          })()}
        </nav>

        {user.role === 'CLIENT' ? (
          <div className="shrink-0 px-3 pb-2">
            <Link
              href="/dashboard/cliente/war-room-live"
              onClick={() => setMobileOpen(false)}
              title={sidebarCollapsed ? t('shell.sosContingencia') : undefined}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200 hover:bg-rose-500/20 transition-colors"
            >
              <Siren className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed ? <span className="truncate">{t('shell.sosContingencia')}</span> : null}
            </Link>
          </div>
        ) : null}

        <div className="shrink-0 p-3 border-t border-gray-200 dark:border-white/10">
          {!sidebarCollapsed && (
            <p className="text-xs text-gray-500 dark:text-white/60 truncate px-2 mb-2">{user.email}</p>
          )}
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-white/80 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span>{t('shell.logout')}</span>}
          </button>
        </div>
      </aside>

      {/* Overlay mobile */}
      <div
        className={`fixed inset-0 bg-black/40 z-30 lg:hidden ${mobileOpen ? 'block' : 'hidden'}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden
      />

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 h-14 flex items-center justify-between gap-4 px-4 lg:px-6 bg-white/90 dark:bg-ads-dark-card/90 backdrop-blur-md border-b border-gray-200 dark:border-white/10">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10"
            aria-label={t('shell.menu')}
          >
            <Menu className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true })
              window.dispatchEvent(e)
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 border border-gray-200 dark:border-white/15"
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">{t('shell.search')}</span>
            <kbd className="hidden sm:inline px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-white/10 rounded">
              ⌘K
            </kbd>
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <LanguageSwitcher />
            <span className="hidden sm:block text-sm font-medium text-gray-900 dark:text-white truncate max-w-[min(200px,40vw)]">
              {user.name || user.email}
            </span>
            {user.role === 'CLIENT' ? <ClientHeaderGamification /> : null}
            <span className="hidden sm:block text-xs text-gray-500 dark:text-gray-400 shrink-0">
              {user.role === 'CLIENT'
                ? t('shell.roleClient')
                : user.role
                  ? ROLE_LABELS[user.role] || user.role
                  : ''}
            </span>
            <ThemeToggle />
            <NotificationsBell />
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {mounted ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          ) : (
            <div>{children}</div>
          )}
        </main>
      </div>
    </div>
  )
}
