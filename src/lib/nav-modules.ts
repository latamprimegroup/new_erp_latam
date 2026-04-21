/** Módulos para Command Palette e navegação */
export type NavItem = {
  href: string
  label: string
  /** Chave i18n (ex: nav.home) — área cliente */
  labelKey?: string
  roles: string[]
  icon: string
}

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

  // ── Central do Gerente de Produção (hub exclusivo) ──
  { href: '/dashboard/gerente-producao', label: '⚙️ Central do Gerente', roles: ['ADMIN', 'PRODUCTION_MANAGER'], icon: 'ShieldCheck' },

  // ── ADS CORE — módulos do gerente ──
  { href: '/dashboard/ads-core', label: 'ADS CORE', roles: ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER'], icon: 'Zap' },
  {
    href: '/dashboard/ads-tracker',
    label: 'Ads Tracker — Central',
    roles: ['ADMIN', 'MANAGER', 'FINANCE'],
    icon: 'Gauge',
  },
  { href: '/dashboard/ads-core/bi', label: 'Dashboard de Gestão (BI)', roles: ['ADMIN', 'PRODUCTION_MANAGER'], icon: 'BarChart3' },
  { href: '/dashboard/ads-core/demandas', label: 'Painel de Demandas', roles: ['ADMIN', 'PRODUCTION_MANAGER'], icon: 'LayoutList' },
  { href: '/dashboard/ads-core/atribuicao', label: 'Estoque de Ativos — Atribuição', roles: ['ADMIN', 'PRODUCTION_MANAGER'], icon: 'Target' },
  { href: '/dashboard/ads-core/nichos', label: 'Gestão por Nicho (Células)', roles: ['ADMIN', 'PRODUCTION_MANAGER'], icon: 'FolderOpen' },
  { href: '/dashboard/ads-core/gestao-contas', label: 'Gestão de Contas (MCC)', roles: ['ADMIN', 'PRODUCTION_MANAGER'], icon: 'Layers' },
  { href: '/dashboard/ads-core/relatorios-producao', label: 'Relatórios e Auditoria', roles: ['ADMIN', 'PRODUCTION_MANAGER'], icon: 'FileBarChart2' },
  { href: '/dashboard/ads-core/rg-abastecimento', label: 'Abastecimento de RG', roles: ['ADMIN', 'PRODUCTION_MANAGER'], icon: 'Package' },
  { href: '/dashboard/producao', label: 'Produção', roles: ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER'], icon: 'Factory' },
  { href: '/dashboard/producao-g2', label: 'Produção Google G2', roles: ['ADMIN', 'PRODUCER', 'FINANCE'], icon: 'Layers' },
  { href: '/dashboard/producao-g2/agente', label: 'Agente G2 Dashboard', roles: ['ADMIN', 'PRODUCER', 'FINANCE'], icon: 'Bot' },
  { href: '/dashboard/treinamento', label: 'Treinamento Blindado', roles: ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER', 'FINANCE', 'DELIVERER', 'COMMERCIAL', 'MANAGER'], icon: 'FileText' },
  { href: '/dashboard/producao/conferencia', label: 'Conferência Diária', roles: ['ADMIN', 'PRODUCTION_MANAGER'], icon: 'ClipboardCheck' },
  { href: '/dashboard/producao/metrics', label: 'Métricas Produção', roles: ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER'], icon: 'BarChart3' },
  { href: '/dashboard/producao/saldo', label: 'Saldo e Saque', roles: ['ADMIN', 'PRODUCER'], icon: 'Wallet' },
  { href: '/dashboard/producao/vault-earnings', label: 'Extrato Vault', roles: ['ADMIN', 'PRODUCER'], icon: 'Banknote' },
  { href: '/dashboard/estoque', label: 'Estoque', roles: ['ADMIN', 'FINANCE'], icon: 'Package' },
  { href: '/dashboard/base', label: 'Base (E-mails/CNPJs)', roles: ['ADMIN'], icon: 'Database' },
  { href: '/dashboard/vendas', label: 'Vendas', roles: ['ADMIN', 'COMMERCIAL', 'FINANCE'], icon: 'ShoppingCart' },
  { href: '/dashboard/commercial', label: 'Pulmão Comercial', roles: ['ADMIN', 'COMMERCIAL'], icon: 'Activity' },
  { href: '/dashboard/gtm-conversao', label: 'GTM & Conversões', roles: ['ADMIN', 'COMMERCIAL', 'FINANCE', 'DELIVERER', 'PRODUCER', 'MANAGER', 'PLUG_PLAY'], icon: 'BarChart2' },
  { href: '/dashboard/roi-crm', label: 'ROI & CRM', roles: ['ADMIN', 'COMMERCIAL', 'FINANCE'], icon: 'LineChart' },
  {
    href: '/dashboard/intelligence-leads',
    label: 'Inteligência de Leads',
    roles: ['ADMIN', 'COMMERCIAL', 'FINANCE'],
    icon: 'Brain',
  },
  { href: '/dashboard/onboarding', label: 'Onboarding Clientes', roles: ['ADMIN', 'COMMERCIAL', 'DELIVERER', 'PRODUCER', 'FINANCE', 'MANAGER'], icon: 'UserPlus' },
  { href: '/dashboard/entregas', label: 'Entregas (Pedidos)', roles: ['ADMIN', 'DELIVERER'], icon: 'Truck' },
  { href: '/dashboard/entregas-grupos', label: 'Entregas por Grupo', roles: ['ADMIN', 'DELIVERER', 'COMMERCIAL', 'PRODUCER'], icon: 'PackageCheck' },
  { href: '/dashboard/logistica/plugplay-tracker', label: 'Delivery Tracker P&P', roles: ['ADMIN', 'DELIVERER', 'COMMERCIAL', 'PRODUCER'], icon: 'Truck' },
  { href: '/dashboard/suporte/rma', label: 'Suporte — RMA', roles: ['ADMIN', 'PRODUCER', 'DELIVERER', 'COMMERCIAL'], icon: 'RefreshCw' },
  { href: '/dashboard/admin/delivery-dashboard', label: 'Dashboard Entregas', roles: ['ADMIN', 'DELIVERER', 'COMMERCIAL'], icon: 'LayoutList' },
  { href: '/dashboard/financeiro', label: 'Financeiro', roles: ['ADMIN', 'FINANCE'], icon: 'Banknote' },
  { href: '/dashboard/saques', label: 'Saques', roles: ['ADMIN', 'FINANCE'], icon: 'Wallet' },
  { href: '/dashboard/metas', label: 'Metas & Bônus', roles: ['ADMIN', 'PRODUCER'], icon: 'Target' },
  { href: '/dashboard/admin', label: 'Admin / Auditoria', roles: ['ADMIN'], icon: 'Shield' },
  { href: '/dashboard/admin/config', label: 'Configurações', roles: ['ADMIN'], icon: 'Settings' },
  { href: '/dashboard/admin/integracoes', label: 'Integrações', roles: ['ADMIN'], icon: 'Plug' },
  { href: '/dashboard/admin/provisioning', label: 'Provisioning Engine', roles: ['ADMIN'], icon: 'Globe' },
  { href: '/dashboard/admin/ceo', label: 'Centro Comando CEO', roles: ['ADMIN'], icon: 'Crown' },
  { href: '/dashboard/admin/war-room', label: 'War Room', roles: ['ADMIN'], icon: 'Radio' },
  { href: '/dashboard/admin/automation-os', label: 'Automation OS', roles: ['ADMIN'], icon: 'Cpu' },
  { href: '/dashboard/admin/guard', label: 'Ads Ativos Guard', roles: ['ADMIN'], icon: 'Shield' },
  { href: '/dashboard/admin/profit-engine', label: 'Profit Engine', roles: ['ADMIN'], icon: 'Zap' },
  { href: '/dashboard/admin/simuladores', label: 'Simuladores', roles: ['ADMIN'], icon: 'Calculator' },
  { href: '/dashboard/admin/dashboards?setor=producao', label: 'Dashboards Inteligentes', roles: ['ADMIN', 'PRODUCER', 'FINANCE', 'COMMERCIAL', 'DELIVERER'], icon: 'LayoutGrid' },
  { href: '/dashboard/admin/backup', label: 'Backup de Dados', roles: ['ADMIN'], icon: 'Archive' },
  { href: '/dashboard/admin/deploy', label: 'Agente Deploy', roles: ['ADMIN'], icon: 'Rocket' },
  { href: '/dashboard/admin/contas-ofertadas', label: 'Contas ofertadas', roles: ['ADMIN'], icon: 'Gift' },
  { href: '/dashboard/admin/contestacoes', label: 'Contestações', roles: ['ADMIN', 'COMMERCIAL'], icon: 'AlertCircle' },
  { href: '/dashboard/admin/tickets', label: 'Tickets & OS', roles: ['ADMIN', 'COMMERCIAL'], icon: 'Ticket' },
  {
    href: '/dashboard/admin/creative-vault',
    label: 'Creative Vault — fila edição',
    roles: ['ADMIN', 'COMMERCIAL'],
    icon: 'Clapperboard',
  },
  {
    href: '/dashboard/admin/live-proof-labs',
    label: 'Live Proof Labs — ofertas validadas',
    roles: ['ADMIN'],
    icon: 'FlaskConical',
  },
  {
    href: '/dashboard/admin/war-room-live',
    label: 'War Room Live — comando',
    roles: ['ADMIN', 'COMMERCIAL'],
    icon: 'Radio',
  },
  { href: '/dashboard/admin/solicitacoes', label: 'Solicitações de contas', roles: ['ADMIN', 'COMMERCIAL'], icon: 'Inbox' },
  { href: '/dashboard/admin/sugestoes', label: 'Sugestões de Melhoria', roles: ['ADMIN'], icon: 'Lightbulb' },
  { href: '/dashboard/sugestoes?tipo=sistema', label: '💡 Melhoria do Sistema', roles: ['ADMIN', 'PRODUCER', 'FINANCE', 'DELIVERER', 'COMMERCIAL', 'MANAGER', 'PRODUCTION_MANAGER', 'PLUG_PLAY'], icon: 'Lightbulb' },
  { href: '/dashboard/sugestoes?tipo=empresa', label: '📢 Melhoria da Empresa', roles: ['ADMIN', 'PRODUCER', 'FINANCE', 'DELIVERER', 'COMMERCIAL', 'MANAGER', 'PRODUCTION_MANAGER', 'PLUG_PLAY'], icon: 'MessageCircle' },
  { href: '/dashboard/admin/contas-entregues', label: 'Contas entregues', roles: ['ADMIN', 'COMMERCIAL'], icon: 'CheckCircle' },
  { href: '/dashboard/admin/black', label: 'Plug & Play Black', roles: ['ADMIN'], icon: 'Zap' },
  { href: '/dashboard/admin/fornecedores', label: 'Fornecedores', roles: ['ADMIN'], icon: 'Store' },
  { href: '/dashboard/admin/fechamento-producao', label: 'Fechamento Produção', roles: ['ADMIN'], icon: 'FileCheck' },
  { href: '/dashboard/admin/usuarios', label: 'Usuários', roles: ['ADMIN'], icon: 'Users' },
  { href: '/dashboard/admin/clientes', label: 'Cadastro de Clientes (CRM)', roles: ['ADMIN', 'COMMERCIAL'], icon: 'BookUser' },
  { href: '/dashboard/admin/relatorio-diario', label: 'Relatório Diário', roles: ['ADMIN'], icon: 'FileText' },
  { href: '/dashboard/relatorios', label: 'Relatórios & KPIs', roles: ['ADMIN', 'COMMERCIAL', 'FINANCE'], icon: 'BarChart2' },
]

export const MODULES_CLIENTE: NavItem[] = [
  { href: '/dashboard/cliente', label: 'Minha Área', labelKey: 'nav.home', roles: ['CLIENT'], icon: 'Home' },
  {
    href: '/dashboard/cliente/manual',
    label: 'Manual do Operador',
    labelKey: 'nav.operatorManual',
    roles: ['CLIENT'],
    icon: 'BookOpen',
  },
  {
    href: '/dashboard/cliente/gamificacao',
    label: 'Hall de patentes',
    labelKey: 'nav.gamification',
    roles: ['CLIENT'],
    icon: 'Trophy',
  },
  {
    href: '/dashboard/cliente/ads-war-room',
    label: 'War Room — Ads Ativos',
    labelKey: 'nav.warRoomAds',
    roles: ['CLIENT'],
    icon: 'Radio',
  },
  {
    href: '/dashboard/cliente/armory',
    label: 'Central de Ativos',
    labelKey: 'nav.armory',
    roles: ['CLIENT'],
    icon: 'Wrench',
  },
  {
    href: '/dashboard/cliente/creative-vault',
    label: 'Creative Vault',
    labelKey: 'nav.creativeVault',
    roles: ['CLIENT'],
    icon: 'Clapperboard',
  },
  {
    href: '/dashboard/cliente/live-proof-labs',
    label: 'Live Proof Labs',
    labelKey: 'nav.liveProofLabs',
    roles: ['CLIENT'],
    icon: 'FlaskConical',
  },
  {
    href: '/dashboard/cliente/shield-tracker',
    label: 'Shield & Tracker',
    labelKey: 'nav.shieldTracker',
    roles: ['CLIENT'],
    icon: 'Shield',
  },
  {
    href: '/dashboard/cliente/profit-board',
    label: 'Profit Board',
    labelKey: 'nav.profitBoard',
    roles: ['CLIENT'],
    icon: 'LineChart',
  },
  {
    href: '/dashboard/cliente/war-room-live',
    label: 'War Room Live',
    labelKey: 'nav.warRoomLive',
    roles: ['CLIENT'],
    icon: 'Radio',
  },
  { href: '/dashboard/cliente/solicitar', label: 'Solicitar Contas', labelKey: 'nav.request', roles: ['CLIENT'], icon: 'PlusCircle' },
  { href: '/dashboard/cliente/pesquisar', label: 'Pesquisar Contas', labelKey: 'nav.search', roles: ['CLIENT'], icon: 'Search' },
  { href: '/dashboard/cliente/compras', label: 'Minhas Compras', labelKey: 'nav.purchases', roles: ['CLIENT'], icon: 'ShoppingBag' },
  { href: '/dashboard/cliente/contas', label: 'Minhas Contas', labelKey: 'nav.accounts', roles: ['CLIENT'], icon: 'FolderOpen' },
  { href: '/dashboard/cliente/entregas', label: 'Minhas entregas', labelKey: 'nav.deliveries', roles: ['CLIENT'], icon: 'Truck' },
  { href: '/dashboard/cliente/contestacoes', label: 'Contestações', labelKey: 'nav.disputes', roles: ['CLIENT'], icon: 'AlertCircle' },
  { href: '/dashboard/cliente/reposicao', label: 'Reposição (RMA)', labelKey: 'nav.rma', roles: ['CLIENT'], icon: 'RefreshCw' },
  { href: '/dashboard/cliente/perfil', label: 'Meu Perfil', labelKey: 'nav.profile', roles: ['CLIENT'], icon: 'User' },
  { href: '/dashboard/cliente/gtm', label: 'GTM & Conversões', labelKey: 'nav.gtm', roles: ['CLIENT'], icon: 'BarChart2' },
  { href: '/dashboard/cliente/suporte', label: 'Suporte', labelKey: 'nav.support', roles: ['CLIENT'], icon: 'MessageCircle' },
  { href: '/dashboard/cliente/landing', label: 'Fábrica de Landing Pages', labelKey: 'nav.landing', roles: ['CLIENT'], icon: 'Rocket' },
  { href: '/dashboard/ecosystem', label: 'Infraestrutura de Guerra', labelKey: 'nav.ecosystem', roles: ['CLIENT'], icon: 'Crosshair' },
  { href: '/dashboard/area-cliente', label: 'Gerador de Ativos', labelKey: 'nav.assets', roles: ['CLIENT'], icon: 'Rocket' },
  { href: '/dashboard/sugestoes?tipo=sistema', label: '💡 Melhoria do Sistema', labelKey: 'nav.suggestSystem', roles: ['CLIENT'], icon: 'Lightbulb' },
  { href: '/dashboard/sugestoes?tipo=empresa', label: '📢 Melhoria da Empresa', labelKey: 'nav.suggestCompany', roles: ['CLIENT'], icon: 'MessageCircle' },
]

export const MODULES_GESTOR: NavItem[] = [
  { href: '/dashboard/gestor', label: 'Dashboard', roles: ['MANAGER'], icon: 'LayoutDashboard' },
  { href: '/dashboard/gestor/lancar', label: 'Lançar Conta', roles: ['MANAGER'], icon: 'Plus' },
  { href: '/dashboard/gestor/contas', label: 'Gerenciar Contas', roles: ['MANAGER'], icon: 'FolderOpen' },
  { href: '/dashboard/gestor/relatorios', label: 'Relatórios', roles: ['MANAGER'], icon: 'BarChart2' },
  { href: '/dashboard/sugestoes?tipo=sistema', label: '💡 Melhoria do Sistema', roles: ['MANAGER'], icon: 'Lightbulb' },
  { href: '/dashboard/sugestoes?tipo=empresa', label: '📢 Melhoria da Empresa', roles: ['MANAGER'], icon: 'MessageCircle' },
]

export const MODULES_PLUGPLAY: NavItem[] = [
  { href: '/dashboard/plugplay', label: 'Plug & Play Black', roles: ['PLUG_PLAY'], icon: 'Zap' },
  { href: '/dashboard/plugplay/saldo', label: 'Saldo e Saque', roles: ['PLUG_PLAY'], icon: 'Wallet' },
  { href: '/dashboard/sugestoes?tipo=sistema', label: '💡 Melhoria do Sistema', roles: ['PLUG_PLAY'], icon: 'Lightbulb' },
  { href: '/dashboard/sugestoes?tipo=empresa', label: '📢 Melhoria da Empresa', roles: ['PLUG_PLAY'], icon: 'MessageCircle' },
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
