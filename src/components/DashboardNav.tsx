'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
const MODULES_ERP = [
  { href: '/dashboard/producao', label: 'Produção', roles: ['ADMIN', 'PRODUCER'] },
  { href: '/dashboard/producao-g2', label: 'Produção Google G2', roles: ['ADMIN', 'PRODUCER', 'FINANCE'] },
  { href: '/dashboard/producao-g2/agente', label: 'Agente G2 Dashboard', roles: ['ADMIN', 'PRODUCER', 'FINANCE'] },
  { href: '/dashboard/producao/conferencia', label: 'Conferência Diária', roles: ['ADMIN', 'PRODUCTION_MANAGER'] },
  { href: '/dashboard/producao/metrics', label: 'Métricas Produção', roles: ['ADMIN', 'PRODUCER'] },
  { href: '/dashboard/producao/saldo', label: 'Saldo e Saque', roles: ['ADMIN', 'PRODUCER'] },
  { href: '/dashboard/estoque', label: 'Estoque', roles: ['ADMIN', 'FINANCE'] },
  { href: '/dashboard/base', label: 'Base (E-mails/CNPJs)', roles: ['ADMIN'] },
  { href: '/dashboard/vendas', label: 'Vendas', roles: ['ADMIN', 'COMMERCIAL'] },
  { href: '/dashboard/onboarding', label: 'Onboarding Clientes', roles: ['ADMIN', 'COMMERCIAL', 'DELIVERER', 'PRODUCER', 'FINANCE', 'MANAGER', 'PRODUCTION_MANAGER'] },
  { href: '/dashboard/entregas', label: 'Entregas (Pedidos)', roles: ['ADMIN', 'DELIVERER'] },
  { href: '/dashboard/entregas-grupos', label: 'Entregas por Grupo', roles: ['ADMIN', 'DELIVERER', 'COMMERCIAL'] },
  { href: '/dashboard/admin/delivery-dashboard', label: 'Dashboard Entregas', roles: ['ADMIN', 'DELIVERER', 'COMMERCIAL'] },
  { href: '/dashboard/financeiro', label: 'Financeiro', roles: ['ADMIN', 'FINANCE'] },
  { href: '/dashboard/saques', label: 'Saques', roles: ['ADMIN', 'FINANCE'] },
  { href: '/dashboard/metas', label: 'Metas & Bônus', roles: ['ADMIN', 'PRODUCER'] },
  { href: '/dashboard/admin', label: 'Admin / Auditoria', roles: ['ADMIN'] },
  { href: '/dashboard/admin/config', label: 'Configurações', roles: ['ADMIN'] },
  { href: '/dashboard/admin/integracoes', label: 'Integrações', roles: ['ADMIN'] },
  { href: '/dashboard/admin/ceo', label: 'Centro Comando CEO', roles: ['ADMIN'] },
  { href: '/dashboard/admin/profit-engine', label: 'Profit Engine', roles: ['ADMIN'] },
  { href: '/dashboard/admin/simuladores', label: 'Simuladores', roles: ['ADMIN'] },
  { href: '/dashboard/admin/dashboards?setor=producao', label: 'Dashboards Inteligentes', roles: ['ADMIN', 'PRODUCER', 'FINANCE', 'COMMERCIAL', 'DELIVERER'] },
  { href: '/dashboard/admin/backup', label: 'Backup de Dados', roles: ['ADMIN'] },
  { href: '/dashboard/admin/deploy', label: 'Agente Deploy', roles: ['ADMIN'] },
  { href: '/dashboard/admin/contas-ofertadas', label: 'Contas ofertadas', roles: ['ADMIN'] },
  { href: '/dashboard/admin/contestacoes', label: 'Contestações', roles: ['ADMIN', 'COMMERCIAL'] },
  { href: '/dashboard/admin/tickets', label: 'Tickets & OS', roles: ['ADMIN', 'COMMERCIAL'] },
  { href: '/dashboard/admin/solicitacoes', label: 'Solicitações de contas', roles: ['ADMIN', 'COMMERCIAL'] },
  { href: '/dashboard/admin/contas-entregues', label: 'Contas entregues (Customer ID)', roles: ['ADMIN', 'COMMERCIAL'] },
  { href: '/dashboard/admin/black', label: 'Plug & Play Black', roles: ['ADMIN'] },
  { href: '/dashboard/admin/fornecedores', label: 'Fornecedores', roles: ['ADMIN'] },
  { href: '/dashboard/admin/fechamento-producao', label: 'Fechamento Produção', roles: ['ADMIN'] },
  { href: '/dashboard/admin/usuarios', label: 'Usuários', roles: ['ADMIN'] },
  { href: '/dashboard/admin/relatorio-diario', label: 'Relatório Diário', roles: ['ADMIN'] },
  { href: '/dashboard/relatorios', label: 'Relatórios & KPIs', roles: ['ADMIN', 'COMMERCIAL'] },
]

const MODULES_CLIENTE = [
  { href: '/dashboard/cliente', label: 'Minha Área', roles: ['CLIENT'] },
  { href: '/dashboard/cliente/solicitar', label: 'Solicitar Contas', roles: ['CLIENT'] },
  { href: '/dashboard/cliente/pesquisar', label: 'Pesquisar Contas', roles: ['CLIENT'] },
  { href: '/dashboard/cliente/compras', label: 'Minhas Compras', roles: ['CLIENT'] },
  { href: '/dashboard/cliente/contas', label: 'Minhas Contas e Gastos', roles: ['CLIENT'] },
  { href: '/dashboard/cliente/contestacoes', label: 'Contestações', roles: ['CLIENT'] },
  { href: '/dashboard/cliente/perfil', label: 'Meu Perfil', roles: ['CLIENT'] },
  { href: '/dashboard/cliente/suporte', label: 'Suporte', roles: ['CLIENT'] },
]

const MODULES_GESTOR = [
  { href: '/dashboard/gestor', label: 'Dashboard', roles: ['MANAGER'] },
  { href: '/dashboard/gestor/lancar', label: 'Lançar Conta', roles: ['MANAGER'] },
  { href: '/dashboard/gestor/contas', label: 'Gerenciar Contas', roles: ['MANAGER'] },
  { href: '/dashboard/gestor/relatorios', label: 'Relatórios', roles: ['MANAGER'] },
]

const MODULES_PLUGPLAY = [
  { href: '/dashboard/plugplay', label: 'Plug & Play Black', roles: ['PLUG_PLAY'] },
]

export function DashboardNav({
  user,
  open,
  onClose,
}: {
  user: { name?: string; email?: string; role?: string }
  open?: boolean
  onClose?: () => void
}) {
  const pathname = usePathname()
  const isClient = user.role === 'CLIENT'
  const isGestor = user.role === 'MANAGER'
  const isPlugPlay = user.role === 'PLUG_PLAY'
  const visibleModules = isClient
    ? MODULES_CLIENTE.filter((m) => user.role && m.roles.includes(user.role))
    : isGestor
      ? MODULES_GESTOR.filter((m) => user.role && m.roles.includes(user.role))
      : isPlugPlay
        ? MODULES_PLUGPLAY.filter((m) => user.role && m.roles.includes(user.role))
        : MODULES_ERP.filter((m) => user.role && m.roles.includes(user.role))

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
      <div className="p-5 border-b border-white/10">
        <Link href="/dashboard" className="flex items-center gap-2" onClick={onClose}>
          <Image
            src="/logo-ads-ativos.png"
            alt="ADS Ativos"
            width={120}
            height={36}
            className="h-9 w-auto object-contain"
            priority
          />
          <span className="text-xs text-white/70 font-medium bg-white/10 px-2 py-0.5 rounded">ERP</span>
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visibleModules.length > 0 ? (
          visibleModules.map((m) => {
            const isActive = pathname === m.href || pathname.startsWith(m.href + '/')
            return (
              <Link
                key={m.href}
                href={m.href}
                onClick={onClose}
                className={`block px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/30'
                    : 'text-white/85 hover:bg-white/15 hover:text-white'
                }`}
              >
                {m.label}
              </Link>
            )
          })
        ) : (
          <Link
            href="/dashboard"
            onClick={onClose}
            className="block px-3 py-2.5 rounded-lg text-sm font-medium text-white/90 hover:bg-white/10"
          >
            Dashboard
          </Link>
        )}
      </nav>
      <div className="p-4 border-t border-white/10">
        <p className="text-xs text-white/60 truncate mb-2">{user.email}</p>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="text-sm text-white/80 hover:text-white hover:underline transition-colors"
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
      {/* Sidebar */}
      <aside
        className={`fixed lg:relative inset-y-0 left-0 z-50 w-64 min-h-screen bg-gradient-to-b from-primary-500 via-primary-600 to-primary-800 flex flex-col shadow-2xl transform transition-transform duration-300 ease-out lg:transform-none ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {content}
      </aside>
    </>
  )
}
