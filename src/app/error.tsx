'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[War Room OS] Erro de rota:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center p-6">
      <div className="max-w-lg w-full text-center space-y-8">

        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-red-700 to-red-900 flex items-center justify-center shadow-2xl shadow-red-900/50">
            <span className="text-4xl">⚠️</span>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-red-400">Ads Ativos</p>
            <p className="text-xs text-zinc-500 mt-0.5">War Room OS</p>
          </div>
        </div>

        {/* Título */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">Algo deu errado</h1>
          <p className="text-zinc-400 text-sm">
            Ocorreu um erro inesperado nesta tela. Seus dados estão seguros.
          </p>
          {error.message && (
            <p className="text-xs text-zinc-600 font-mono bg-zinc-900 rounded-lg px-4 py-2 border border-zinc-800 break-all">
              {error.digest ? `[${error.digest}] ` : ''}{error.message}
            </p>
          )}
        </div>

        {/* Ações */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm transition-colors shadow-lg shadow-primary-900/40"
          >
            🔄 Tentar novamente
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-semibold text-sm transition-colors"
          >
            🏠 Voltar ao Dashboard
          </a>
        </div>

        <div className="border-t border-zinc-800 pt-4">
          <p className="text-[10px] text-zinc-600">
            Se o problema persistir, recarregue a página ou limpe o cache do navegador (Ctrl + Shift + R)
          </p>
        </div>

      </div>
    </div>
  )
}
