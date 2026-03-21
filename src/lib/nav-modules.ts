/** Módulos para Command Palette e navegação */
export type NavItem = { href: string; label: string; roles: string[]; icon: string }

/** Retorna o href do item ativo mais específico (apenas um item marcado por vez) */
export function getActiveNavHref(pathname: string, modules: NavItem[]): string | null {
  const matches = modules.filter((m) => {
    const hrefPath = m.href.split('?')[0]
    return pathname === hrefPath || pathname.startsWith(hrefPath + '/')
  })
  if (matches.length === 0) return null
  const best = matches.sort((a, b) => b.href.length - a.href.length)[0]
  return best.href
}

export const MODULES_ERP: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', roles: ['ADMIN', 'PRODUCER', 'DELIVERER', 'FINANCE', 'COMMERCIAL'], icon: 'LayoutDashboard' },
  { href: '/dashboard/producao', label: 'Produção', roles: ['ADMIN', 'PRODUCER'], icon: 'Factory' },
  { href: '/dashboard/producao-g2', label: 'Produção Google G2', roles: ['ADMIN', 'PRODUCER', 'FINANCE'], icon: 'Layers' },
  { href: '/dashboard/producao-g2/agente', label: 'Agente G2 Dashboard', roles: ['ADMIN', 'PRODUCER', 'FINANCE'], icon: 'Bot' },
  { href: '/dashboard/producao/conferencia', label: 'Conferência Diária', roles: ['ADMIN', 'PRODUCTION_MANAGER'], icon: 'ClipboardCheck' },
  { href: '/dashboard/producao/metrics', label: 'Métricas Produção', roles: ['ADMIN', 'PRODUCER'], icon: 'BarChart3' },
  { href: '/dashboard/producao/saldo', label: 'Saldo e Saque', roles: ['ADMIN', 'PRODUCER'], icon: 'Wallet' },
  { href: '/dashboard/estoque', label: 'Estoque', roles: ['ADMIN', 'FINANCE'], icon: 'Package' },
  { href: '/dashboard/base', label: 'Base (E-mails/CNPJs)', roles: ['ADMIN'], icon: 'Database' },
  { href: '/dashboard/vendas', label: 'Vendas', roles: ['ADMIN', 'COMMERCIAL'], icon: 'ShoppingCart' },
  { href: '/dashboard/onboarding', label: 'Onboarding Clientes', roles: ['ADMIN', 'COMMERCIAL', 'DELIVERER', 'PRODUCER', 'FINANCE', 'MANAGER', 'PRODUCTION_MANAGER'], icon: 'UserPlus' },
  { href: '/dashboard/entregas', label: 'Entregas (Pedidos)', roles: ['ADMIN', 'DELIVERER'], icon: 'Truck' },
  { href: '/dashboard/entregas-grupos', label: 'Entregas por Grupo', roles: ['ADMIN', 'DELIVERER', 'COMMERCIAL'], icon: 'PackageCheck' },
  { href: '/dashboard/admin/delivery-dashboard', label: 'Dashboard Entregas', roles: ['ADMIN', 'DELIVERER', 'COMMERCIAL'], icon: 'LayoutList' },
  { href: '/dashboard/financeiro', label: 'Financeiro', roles: ['ADMIN', 'FINANCE'], icon: 'Banknote' },
  { href: '/dashboard/saques', label: 'Saques', roles: ['ADMIN', 'FINANCE'], icon: 'Wallet' },
  { href: '/dashboard/metas', label: 'Metas & Bônus', roles: ['ADMIN', 'PRODUCER'], icon: 'Target' },
  { href: '/dashboard/admin', label: 'Admin / Auditoria', roles: ['ADMIN'], icon: 'Shield' },
  { href: '/dashboard/admin/config', label: 'Configurações', roles: ['ADMIN'], icon: 'Settings' },
  { href: '/dashboard/admin/integracoes', label: 'Integrações', roles: ['ADMIN'], icon: 'Plug' },
  { href: '/dashboard/admin/ceo', label: 'Centro Comando CEO', roles: ['ADMIN'], icon: 'Crown' },
  { href: '/dashboard/admin/profit-engine', label: 'Profit Engine', roles: ['ADMIN'], icon: 'Zap' },
  { href: '/dashboard/admin/simuladores', label: 'Simuladores', roles: ['ADMIN'], icon: 'Calculator' },
  { href: '/dashboard/admin/dashboards?setor=producao', label: 'Dashboards Inteligentes', roles: ['ADMIN', 'PRODUCER', 'FINANCE', 'COMMERCIAL', 'DELIVERER'], icon: 'LayoutGrid' },
  { href: '/dashboard/admin/backup', label: 'Backup de Dados', roles: ['ADMIN'], icon: 'Archive' },
  { href: '/dashboard/admin/deploy', label: 'Agente Deploy', roles: ['ADMIN'], icon: 'Rocket' },
  { href: '/dashboard/admin/contas-ofertadas', label: 'Contas ofertadas', roles: ['ADMIN'], icon: 'Gift' },
  { href: '/dashboard/admin/contestacoes', label: 'Contestações', roles: ['ADMIN', 'COMMERCIAL'], icon: 'AlertCircle' },
  { href: '/dashboard/admin/tickets', label: 'Tickets & OS', roles: ['ADMIN', 'COMMERCIAL'], icon: 'Ticket' },
  { href: '/dashboard/admin/solicitacoes', label: 'Solicitações de contas', roles: ['ADMIN', 'COMMERCIAL'], icon: 'Inbox' },
  { href: '/dashboard/admin/sugestoes', label: 'Sugestões de Melhoria', roles: ['ADMIN'], icon: 'Lightbulb' },
  { href: '/dashboard/admin/contas-entregues', label: 'Contas entregues', roles: ['ADMIN', 'COMMERCIAL'], icon: 'CheckCircle' },
  { href: '/dashboard/admin/black', label: 'Plug & Play Black', roles: ['ADMIN'], icon: 'Zap' },
  { href: '/dashboard/admin/fornecedores', label: 'Fornecedores', roles: ['ADMIN'], icon: 'Store' },
  { href: '/dashboard/admin/fechamento-producao', label: 'Fechamento Produção', roles: ['ADMIN'], icon: 'FileCheck' },
  { href: '/dashboard/admin/usuarios', label: 'Usuários', roles: ['ADMIN'], icon: 'Users' },
  { href: '/dashboard/admin/relatorio-diario', label: 'Relatório Diário', roles: ['ADMIN'], icon: 'FileText' },
  { href: '/dashboard/relatorios', label: 'Relatórios & KPIs', roles: ['ADMIN', 'COMMERCIAL'], icon: 'BarChart2' },
]

export const MODULES_CLIENTE: NavItem[] = [
  { href: '/dashboard/cliente', label: 'Minha Área', roles: ['CLIENT'], icon: 'Home' },
  { href: '/dashboard/cliente/solicitar', label: 'Solicitar Contas', roles: ['CLIENT'], icon: 'PlusCircle' },
  { href: '/dashboard/cliente/pesquisar', label: 'Pesquisar Contas', roles: ['CLIENT'], icon: 'Search' },
  { href: '/dashboard/cliente/compras', label: 'Minhas Compras', roles: ['CLIENT'], icon: 'ShoppingBag' },
  { href: '/dashboard/cliente/contas', label: 'Minhas Contas', roles: ['CLIENT'], icon: 'FolderOpen' },
  { href: '/dashboard/cliente/contestacoes', label: 'Contestações', roles: ['CLIENT'], icon: 'AlertCircle' },
  { href: '/dashboard/cliente/perfil', label: 'Meu Perfil', roles: ['CLIENT'], icon: 'User' },
  { href: '/dashboard/cliente/suporte', label: 'Suporte', roles: ['CLIENT'], icon: 'MessageCircle' },
  { href: '/dashboard/cliente/landing', label: 'Fábrica de Landing Pages', roles: ['CLIENT'], icon: 'Rocket' },
]

export const MODULES_GESTOR: NavItem[] = [
  { href: '/dashboard/gestor', label: 'Dashboard', roles: ['MANAGER'], icon: 'LayoutDashboard' },
  { href: '/dashboard/gestor/lancar', label: 'Lançar Conta', roles: ['MANAGER'], icon: 'Plus' },
  { href: '/dashboard/gestor/contas', label: 'Gerenciar Contas', roles: ['MANAGER'], icon: 'FolderOpen' },
  { href: '/dashboard/gestor/relatorios', label: 'Relatórios', roles: ['MANAGER'], icon: 'BarChart2' },
]

export const MODULES_PLUGPLAY: NavItem[] = [
  { href: '/dashboard/plugplay', label: 'Plug & Play Black', roles: ['PLUG_PLAY'], icon: 'Zap' },
]

export function getModulesForRole(role?: string): NavItem[] {
  const list =
    role === 'CLIENT'
      ? MODULES_CLIENTE
      : role === 'MANAGER'
        ? MODULES_GESTOR
        : role === 'PLUG_PLAY'
          ? MODULES_PLUGPLAY
          : MODULES_ERP
  return list.filter((m) => !role || m.roles.includes(role))
}
