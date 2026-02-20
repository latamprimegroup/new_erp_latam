import Link from 'next/link'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-br from-slate-50 via-white to-primary-50/40 dark:from-ads-dark-bg dark:via-ads-dark-bg dark:to-ads-dark-bg relative overflow-hidden">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      {/* Decorative */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(21,162,235,0.12),transparent)] pointer-events-none" />
      <div className="absolute top-20 right-20 w-72 h-72 bg-primary-400/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 left-20 w-96 h-96 bg-accent-400/10 rounded-full blur-3xl pointer-events-none" />

      <div className="text-center max-w-2xl relative z-10 animate-fade-in mt-8">
        <p className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary-500 to-primary-600 bg-clip-text text-transparent mb-4">
          Ads Ativos
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-gray-100 mb-3 tracking-tight">
          ERP – Gestão de produção, estoque e vendas
        </h1>
        <p className="text-slate-600 dark:text-gray-400 mb-10 text-lg">
          Sistema de gestão de produção, estoque, vendas, entregas e financeiro
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/login" className="btn-primary">
            Acessar Sistema
          </Link>
          <Link href="/cadastro" className="btn-secondary">
            Cadastrar-se
          </Link>
        </div>
        <p className="mt-10 text-sm text-slate-500 dark:text-gray-400">
          Ainda não tem uma conta?{' '}
          <Link href="/cadastro" className="link-accent">
            Cadastre-se agora
          </Link>
          {' · '}
          <Link href="/setup" className="link-accent">
            Primeira instalação
          </Link>
        </p>
      </div>
    </main>
  )
}
