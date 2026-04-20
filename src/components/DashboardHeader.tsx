'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { signOut } from 'next-auth/react'
import { NotificationsBell } from './NotificationsBell'
import { ThemeToggle } from './ThemeToggle'

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

const LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  'ads-core': 'ADS CORE',
  producao: 'Produção',
  estoque: 'Estoque',
  base: 'Base',
  vendas: 'Vendas',
  commercial: 'Pulmão Comercial',
  entregas: 'Entregas',
  financeiro: 'Financeiro',
  saques: 'Saques',
  metas: 'Metas & Bônus',
  admin: 'Admin',
  'contas-ofertadas': 'Contas ofertadas',
  contestacoes: 'Contestações',
  solicitacoes: 'Solicitações',
  'contas-entregues': 'Customer ID',
  tickets: 'Tickets & OS',
  'profit-engine': 'Profit Engine',
  ceo: 'Centro Comando CEO',
  deploy: 'Agente Deploy',
  config: 'Configurações',
  fornecedores: 'Fornecedores',
  relatorios: 'Relatórios',
  'roi-crm': 'ROI & CRM',
  cliente: 'Minha Área',
  pesquisar: 'Pesquisar',
  compras: 'Compras',
  perfil: 'Perfil',
  suporte: 'Suporte',
  gestor: 'Gestor',
  lancar: 'Lançar Conta',
  contas: 'Contas',
  pedido: 'Pedido',
  pagamento: 'Pagamento',
}

function getBreadcrumbs(pathname: string) {
  const segments = pathname.split('/').filter(Boolean)
  const items: { label: string; href: string }[] = []

  let href = ''
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    href += `/${seg}`
    const label = LABELS[seg] || seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ')
    items.push({ label, href })
  }

  return items
}

export function DashboardHeader({
  user,
  onMenuClick,
}: {
  user?: { name?: string | null; email?: string | null; role?: string }
  onMenuClick?: () => void
}) {
  const pathname = usePathname()
  const breadcrumbs = getBreadcrumbs(pathname)

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-ads-dark-card/80 backdrop-blur-md border-b border-gray-200/80 dark:border-white/10 shadow-sm px-4 lg:px-6 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-2 rounded-lg text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          aria-label="Abrir menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <nav className="flex items-center gap-1.5 text-sm" aria-label="Breadcrumb">
          <Link href="/dashboard" className="hidden sm:flex shrink-0 mr-2 items-center" aria-label="ADS Ativos">
            <Image src="/logos/ads-azul-ativos-branco.png" alt="ADS Ativos" width={100} height={32} className="h-7 w-auto dark:hidden" />
            <Image src="/logos/ads-darkGray-ativos-darkGray-.png" alt="ADS Ativos" width={100} height={32} className="h-7 w-auto hidden dark:block" />
          </Link>
          <span className="text-gray-300 dark:text-gray-600 hidden sm:inline">|</span>
          <Link
            href="/dashboard"
            className="text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            Início
          </Link>
          {breadcrumbs.map((item, i) => (
            <span key={item.href} className="flex items-center gap-1.5">
              <span className="text-gray-300">/</span>
              {i === breadcrumbs.length - 1 ? (
                <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{item.label}</span>
              ) : (
                <Link
                  href={item.href}
                  className="text-gray-500 hover:text-primary-600 transition-colors truncate"
                >
                  {item.label}
                </Link>
              )}
            </span>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {user && (
          <div className="hidden sm:block text-right">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user.name || user.email || 'Usuário'}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{user.role ? ROLE_LABELS[user.role] || user.role : ''}</p>
          </div>
        )}
        <ThemeToggle />
        <NotificationsBell />
        {user && (
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors hidden sm:block"
            title="Sair"
          >
            Sair
          </button>
        )}
      </div>
    </header>
  )
}
