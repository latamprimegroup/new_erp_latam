'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[War Room OS] Erro no dashboard:', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-lg w-full text-center space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center shadow-xl">
            <span className="text-3xl">⚠️</span>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-red-500">War Room OS</p>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Algo deu errado nesta tela</h1>
          <p className="text-gray-500 dark:text-zinc-400 text-sm">
            Ocorreu um erro inesperado. Seus dados estão seguros.
          </p>
          {error.message && (
            <p className="text-xs text-zinc-500 dark:text-zinc-600 font-mono bg-zinc-100 dark:bg-zinc-900 rounded-lg px-4 py-2 border border-zinc-200 dark:border-zinc-800 break-all">
              {error.digest ? `[${error.digest}] ` : ''}{error.message}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm transition-colors"
          >
            🔄 Tentar novamente
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-200 font-semibold text-sm transition-colors"
          >
            🏠 Voltar ao Dashboard
          </Link>
        </div>

        <p className="text-[10px] text-zinc-400 dark:text-zinc-600">
          Se o problema persistir, recarregue a página (Ctrl + Shift + R)
        </p>
      </div>
    </div>
  )
}
