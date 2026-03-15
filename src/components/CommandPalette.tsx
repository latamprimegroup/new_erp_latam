'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, LayoutDashboard, ChevronRight } from 'lucide-react'
import { getModulesForRole } from '@/lib/nav-modules'

type CommandPaletteProps = {
  userRole?: string
}

export function CommandPalette({ userRole }: CommandPaletteProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)

  const modules = getModulesForRole(userRole).filter((m) =>
    m.label.toLowerCase().includes(query.toLowerCase())
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
        setQuery('')
        setSelected(0)
      }
      if (!open) return
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelected((s) => Math.min(s + 1, modules.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelected((s) => Math.max(s - 1, 0))
      } else if (e.key === 'Enter' && modules[selected]) {
        e.preventDefault()
        router.push(modules[selected].href)
        setOpen(false)
      }
    },
    [open, modules, selected, router]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    setSelected(0)
  }, [query])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <Search className="w-5 h-5 text-zinc-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar módulos..."
            className="flex-1 bg-transparent text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none text-base"
            autoFocus
          />
          <kbd className="hidden sm:inline px-2 py-1 text-xs font-mono bg-zinc-100 dark:bg-zinc-800 rounded text-zinc-500">
            ESC
          </kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {modules.length === 0 ? (
            <p className="px-4 py-8 text-center text-zinc-500 text-sm">Nenhum módulo encontrado</p>
          ) : (
            modules.map((m, i) => (
              <button
                key={m.href}
                type="button"
                onClick={() => {
                  router.push(m.href)
                  setOpen(false)
                }}
                onMouseEnter={() => setSelected(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === selected
                    ? 'bg-primary-500/10 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 shrink-0 text-zinc-400" />
                <span className="flex-1 font-medium">{m.label}</span>
                <ChevronRight className="w-4 h-4 shrink-0 opacity-50" />
              </button>
            ))
          )}
        </div>
        <div className="px-5 py-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-4 text-xs text-zinc-500">
          <span>
            <kbd className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded">↑↓</kbd> navegar
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded">↵</kbd> abrir
          </span>
        </div>
      </div>
    </div>
  )
}
