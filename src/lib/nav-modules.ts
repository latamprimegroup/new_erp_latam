/** Módulos para Command Palette e navegação */
export type NavItem = { href: string; label: string; roles: string[] }

export const MODULES_ERP: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', roles: ['ADMIN', 'PRODUCER', 'DELIVERER', 'FINANCE', 'COMMERCIAL'] },
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
  { href: '/dashboard/admin/contas-entregues', label: 'Contas entregues', roles: ['ADMIN', 'COMMERCIAL'] },
  { href: '/dashboard/admin/black', label: 'Plug & Play Black', roles: ['ADMIN'] },
  { href: '/dashboard/admin/fornecedores', label: 'Fornecedores', roles: ['ADMIN'] },
  { href: '/dashboard/admin/fechamento-producao', label: 'Fechamento Produção', roles: ['ADMIN'] },
  { href: '/dashboard/admin/usuarios', label: 'Usuários', roles: ['ADMIN'] },
  { href: '/dashboard/admin/relatorio-diario', label: 'Relatório Diário', roles: ['ADMIN'] },
  { href: '/dashboard/relatorios', label: 'Relatórios & KPIs', roles: ['ADMIN', 'COMMERCIAL'] },
]

export const MODULES_CLIENTE: NavItem[] = [
  { href: '/dashboard/cliente', label: 'Minha Área', roles: ['CLIENT'] },
  { href: '/dashboard/cliente/solicitar', label: 'Solicitar Contas', roles: ['CLIENT'] },
  { href: '/dashboard/cliente/pesquisar', label: 'Pesquisar Contas', roles: ['CLIENT'] },
  { href: '/dashboard/cliente/compras', label: 'Minhas Compras', roles: ['CLIENT'] },
  { href: '/dashboard/cliente/contas', label: 'Minhas Contas', roles: ['CLIENT'] },
  { href: '/dashboard/cliente/contestacoes', label: 'Contestações', roles: ['CLIENT'] },
  { href: '/dashboard/cliente/perfil', label: 'Meu Perfil', roles: ['CLIENT'] },
  { href: '/dashboard/cliente/suporte', label: 'Suporte', roles: ['CLIENT'] },
  { href: '/dashboard/cliente/landing', label: 'Fábrica de Landing Pages', roles: ['CLIENT'] },
]

export const MODULES_GESTOR: NavItem[] = [
  { href: '/dashboard/gestor', label: 'Dashboard', roles: ['MANAGER'] },
  { href: '/dashboard/gestor/lancar', label: 'Lançar Conta', roles: ['MANAGER'] },
  { href: '/dashboard/gestor/contas', label: 'Gerenciar Contas', roles: ['MANAGER'] },
  { href: '/dashboard/gestor/relatorios', label: 'Relatórios', roles: ['MANAGER'] },
]

export const MODULES_PLUGPLAY: NavItem[] = [
  { href: '/dashboard/plugplay', label: 'Plug & Play Black', roles: ['PLUG_PLAY'] },
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
