'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  PanelLeftClose,
  PanelLeft,
  Search,
  LogOut,
  Menu,
  LayoutDashboard,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { CommandPalette } from './CommandPalette'
import { ThemeToggle } from './ThemeToggle'
import { NotificationsBell } from './NotificationsBell'
import { getModulesForRole } from '@/lib/nav-modules'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  PRODUCER: 'Produção',
  DELIVERER: 'Entregas',
  FINANCE: 'Financeiro',
  COMMERCIAL: 'Vendas',
  CLIENT: 'Cliente',
  MANAGER: 'Gestor',
  PLUG_PLAY: 'Plug & Play',
}

export function ShellEnterprise({
  user,
  children,
}: {
  user: { name?: string | null; email?: string | null; role?: string }
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const modules = getModulesForRole(user.role)

  return (
    <div className="min-h-screen flex bg-zinc-50 dark:bg-zinc-950">
      <CommandPalette userRole={user.role} />

      {/* Sidebar retrátil */}
      <aside
        className={`fixed lg:relative inset-y-0 left-0 z-40 flex flex-col bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 transition-all duration-300 ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800 min-h-[57px]">
          {!sidebarCollapsed && (
            <Link href="/dashboard" className="font-bold text-lg text-zinc-900 dark:text-white truncate">
              Ads Ativos
            </Link>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 lg:flex hidden"
            aria-label={sidebarCollapsed ? 'Expandir' : 'Recolher'}
          >
            {sidebarCollapsed ? <PanelLeft className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>
        </div>

        <nav className="flex-1 p-2 overflow-y-auto">
          {modules.map((m) => {
            const isActive = pathname === m.href || pathname.startsWith(m.href + '/')
            return (
              <Link
                key={m.href}
                href={m.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-500/15 text-primary-600 dark:text-primary-400'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{m.label}</span>}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800">
          {!sidebarCollapsed && (
            <p className="text-xs text-zinc-500 truncate px-2 mb-2">{user.email}</p>
          )}
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span>Sair</span>}
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
        <header className="sticky top-0 z-20 h-14 flex items-center justify-between gap-4 px-4 lg:px-6 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true })
              window.dispatchEvent(e)
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Buscar...</span>
            <kbd className="hidden sm:inline px-1.5 py-0.5 text-xs bg-zinc-100 dark:bg-zinc-800 rounded">
              ⌘K
            </kbd>
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden sm:block text-sm font-medium text-zinc-900 dark:text-white">
              {user.name || user.email}
            </span>
            <span className="hidden sm:block text-xs text-zinc-500">
              {user.role ? ROLE_LABELS[user.role] || user.role : ''}
            </span>
            <ThemeToggle />
            <NotificationsBell />
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
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
        </main>
      </div>
    </div>
  )
}
