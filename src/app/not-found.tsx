import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center p-6">
      <div className="max-w-lg w-full text-center space-y-8">

        {/* Logo / Marca */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center shadow-2xl shadow-primary-900/50">
            <span className="text-4xl">🛰️</span>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-primary-400">Ads Ativos</p>
            <p className="text-xs text-zinc-500 mt-0.5">War Room OS</p>
          </div>
        </div>

        {/* Código de erro */}
        <div className="relative">
          <p className="text-[8rem] font-black text-zinc-800 leading-none select-none pointer-events-none">
            404
          </p>
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-2xl font-bold text-white">Página não encontrada</p>
          </div>
        </div>

        {/* Mensagem */}
        <div className="space-y-2">
          <p className="text-zinc-400 text-sm">
            A rota que você tentou acessar não existe ou foi movida.
          </p>
          <p className="text-zinc-600 text-xs">
            Se você foi redirecionado aqui por um link interno, entre em contato com o suporte.
          </p>
        </div>

        {/* Ações */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm transition-colors shadow-lg shadow-primary-900/40"
          >
            🏠 Ir para o Dashboard
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-semibold text-sm transition-colors"
          >
            🔐 Ir para o Login
          </Link>
        </div>

        {/* Separador */}
        <div className="border-t border-zinc-800 pt-4">
          <p className="text-[10px] text-zinc-600">
            Ads Ativos ERP · War Room OS · Se o problema persistir, limpe o cache do navegador
          </p>
        </div>

      </div>
    </div>
  )
}
