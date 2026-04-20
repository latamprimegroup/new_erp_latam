import Link from 'next/link'
import Image from 'next/image'
import { ThemeToggle } from '@/components/ThemeToggle'
import { HomeStockTeaser } from '@/components/home/HomeStockTeaser'
import { HomeWhatsAppFab } from '@/components/home/HomeWhatsAppFab'

export default function HomePage() {
  const homeNews = process.env.NEXT_PUBLIC_HOME_NEWS?.trim()
  const waSupport = process.env.NEXT_PUBLIC_WHATSAPP_SUPORTE?.trim()

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-ads-offwhite dark:bg-ads-navy relative overflow-hidden">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      {/* Quarter-circle accent Style Guide */}
      <div className="absolute top-0 left-0 w-64 h-64 bg-primary-500/20 rounded-br-full pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(37,99,235,0.12),transparent)] pointer-events-none" />

      <div className="text-center max-w-2xl relative z-10 animate-fade-in mt-8">
        <Link href="/" className="inline-block mb-4">
          <Image src="/logos/ads-azul-ativos-branco.png" alt="ADS Ativos" width={180} height={56} className="h-14 w-auto mx-auto dark:hidden" priority />
          <Image src="/logos/ads-branco-ativos-branco.png" alt="ADS Ativos" width={180} height={56} className="h-14 w-auto mx-auto hidden dark:block" priority />
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-gray-100 mb-3 tracking-tight">
          ERP – Gestão de produção, estoque e vendas
        </h1>
        <p className="text-slate-600 dark:text-gray-400 mb-10 text-lg">
          Sistema de gestão de produção, estoque, vendas, entregas e financeiro
        </p>
        {homeNews ? (
          <div className="mb-8 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-3 text-left text-sm text-slate-700 dark:text-cyan-100/90 max-w-xl mx-auto">
            <p className="text-[10px] uppercase tracking-wider text-cyan-600 dark:text-cyan-400 font-semibold mb-1">
              Novidades do sistema
            </p>
            <p className="text-slate-600 dark:text-gray-300">{homeNews}</p>
          </div>
        ) : null}
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
        <HomeStockTeaser />
      </div>
      {waSupport ? (
        <HomeWhatsAppFab
          phoneE164={waSupport}
          prefilledMessage="Olá! Preciso de ajuda com o ERP Ads Ativos (acesso ou cadastro)."
        />
      ) : null}
    </main>
  )
}
