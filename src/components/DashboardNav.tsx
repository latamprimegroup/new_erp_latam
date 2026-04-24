'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { getModulesForRole, getActiveNavHref } from '@/lib/nav-modules'
import { getNavIcon } from '@/lib/nav-icons'

export function DashboardNav({
  user,
  open,
  onClose,
}: {
  user: { name?: string; email?: string; role?: string; cargo?: string | null }
  open?: boolean
  onClose?: () => void
}) {
  const pathname = usePathname()
  const visibleModules = getModulesForRole(user.role, user.cargo)

  useEffect(() => {
    if (open && window.innerWidth < 1024) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  const content = (
    <>
      <div className="shrink-0 p-5 border-b border-gray-200 dark:border-white/10">
        <Link href="/dashboard" className="flex items-center gap-2" onClick={onClose}>
          <Image src="/logos/ads-azul-ativos-branco.png" alt="ADS Ativos" width={120} height={36} className="h-9 w-auto dark:hidden" />
          <Image src="/logos/ads-branco-ativos-branco.png" alt="ADS Ativos" width={120} height={36} className="h-9 w-auto hidden dark:block" />
          <span className="text-xs text-gray-500 dark:text-white/80 font-medium bg-gray-200 dark:bg-white/20 px-2 py-0.5 rounded">ERP</span>
        </Link>
      </div>
      <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-ads">
        {visibleModules.length > 0 ? (
          (() => {
            const activeHref = getActiveNavHref(pathname, visibleModules)

            // Agrupa módulos por grupo preservando a ordem de aparição
            const groups: { name: string; items: typeof visibleModules }[] = []
            const seen = new Map<string, number>()
            for (const m of visibleModules) {
              const g = m.group ?? ''
              if (!seen.has(g)) {
                seen.set(g, groups.length)
                groups.push({ name: g, items: [] })
              }
              groups[seen.get(g)!].items.push(m)
            }

            const hasGroups = groups.some((g) => g.name !== '')

            if (!hasGroups) {
              return (
                <div className="p-3 space-y-1">
                  {visibleModules.map((m) => {
                    const isActive = m.href === activeHref
                    const Icon = getNavIcon(m.icon)
                    return (
                      <Link
                        key={m.href}
                        href={m.href}
                        onClick={onClose}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                          isActive
                            ? 'bg-primary-100 dark:bg-primary-500 text-primary-700 dark:text-white shadow-lg dark:shadow-primary-500/30'
                            : 'text-gray-700 dark:text-white/85 hover:bg-gray-100 dark:hover:bg-white/15 hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        {m.label}
                      </Link>
                    )
                  })}
                </div>
              )
            }

            return (
              <div className="p-3 space-y-4">
                {groups.map((group) => (
                  <div key={group.name}>
                    {group.name && (
                      <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-white/35 select-none">
                        {group.name}
                      </p>
                    )}
                    <div className="space-y-0.5">
                      {group.items.map((m) => {
                        const isActive = m.href === activeHref
                        const Icon = getNavIcon(m.icon)
                        return (
                          <Link
                            key={m.href}
                            href={m.href}
                            onClick={onClose}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                              isActive
                                ? 'bg-primary-100 dark:bg-primary-500 text-primary-700 dark:text-white shadow-md dark:shadow-primary-500/30'
                                : 'text-gray-700 dark:text-white/80 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white'
                            }`}
                          >
                            <Icon className={`w-4 h-4 shrink-0 ${isActive ? '' : 'opacity-70'}`} />
                            <span className="truncate">{m.label}</span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()
        ) : (
          <div className="p-3">
            <Link
              href="/dashboard"
              onClick={onClose}
              className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 dark:text-white/90 hover:bg-gray-100 dark:hover:bg-white/10"
            >
              Dashboard
            </Link>
          </div>
        )}
      </nav>
      <div className="shrink-0 p-4 border-t border-gray-200 dark:border-white/10">
        <p className="text-xs text-gray-500 dark:text-white/60 truncate mb-2">{user.email}</p>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="text-sm text-gray-600 dark:text-white/80 hover:text-gray-900 dark:hover:text-white hover:underline transition-colors"
        >
          Sair
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Overlay mobile */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Sidebar: light = fundo claro | dark = navy */}
      <aside
        className={`fixed lg:relative inset-y-0 left-0 z-50 w-64 h-screen bg-white dark:bg-ads-navy flex flex-col shadow-2xl transform transition-transform duration-300 ease-out lg:transform-none overflow-hidden border-r border-gray-200 dark:border-none ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="absolute top-0 left-0 w-24 h-24 bg-primary-500 rounded-br-full opacity-20 pointer-events-none hidden dark:block" />
        <div className="relative flex min-h-0 flex-1 flex-col">
          {content}
        </div>
      </aside>
    </>
  )
}
