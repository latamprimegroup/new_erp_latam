/** Módulos para Command Palette e navegação */
export type NavItem = {
  href: string
  label: string
  /** Chave i18n (ex: nav.home) — área cliente */
  labelKey?: string
  /** Badge curto opcional exibido no menu lateral (ex.: BR, INTL) */
  menuBadge?: string
  roles: string[]
  icon: string
  /** Grupo/seção que aparece como header no sidebar */
  group?: string
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
  // ── Início ─────────────────────────────────────────────────────────────────
  {
    href: '/dashboard',
    label: 'Dashboard',
    roles: ['ADMIN', 'PRODUCER', 'DELIVERER', 'FINANCE', 'COMMERCIAL'],
    icon: 'LayoutDashboard',
    group: 'Início',
  },
  {
    href: '/dashboard/gerente-producao',
    label: 'Central do Gerente',
    roles: ['ADMIN', 'PRODUCTION_MANAGER'],
    icon: 'ShieldCheck',
    group: 'Início',
  },

  // ── Produção ───────────────────────────────────────────────────────────────
  {
    href: '/dashboard/producao',
    label: 'Produção de Contas',
    roles: ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER'],
    icon: 'Factory',
    group: 'Produção',
  },
  {
    href: '/dashboard/producao/conferencia',
    label: 'Conferência Diária',
    roles: ['ADMIN', 'PRODUCTION_MANAGER'],
    icon: 'ClipboardCheck',
    group: 'Produção',
  },
  {
    href: '/dashboard/producao/metrics',
    label: 'Métricas de Produção',
    roles: ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER'],
    icon: 'BarChart3',
    group: 'Produção',
  },
  {
    href: '/dashboard/producao-g2',
    label: 'Produção Google G2',
    roles: ['ADMIN', 'PRODUCER'],
    icon: 'Layers',
    group: 'Produção',
  },
  {
    href: '/dashboard/producao-g2/agente',
    label: 'Agente G2 Dashboard',
    roles: ['ADMIN', 'PRODUCER'],
    icon: 'Bot',
    group: 'Produção',
  },
  {
    href: '/dashboard/producao/saldo',
    label: 'Saldo e Saque',
    roles: ['ADMIN', 'PRODUCER'],
    icon: 'Wallet',
    group: 'Produção',
  },
  {
    href: '/dashboard/producao/vault-earnings',
    label: 'Extrato Vault',
    roles: ['ADMIN', 'PRODUCER'],
    icon: 'Banknote',
    group: 'Produção',
  },
  {
    href: '/dashboard/metas',
    label: 'Metas & Bônus',
    roles: ['ADMIN', 'PRODUCER'],
    icon: 'Target',
    group: 'Produção',
  },
  {
    href: '/dashboard/producao/trocas',
    label: 'Trocas & Reposição',
    roles: ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER'],
    icon: 'ShieldAlert',
    group: 'Produção',
  },

  // ── ADS CORE — Hub ────────────────────────────────────────────────────────
  {
    href: '/dashboard/ads-core',
    label: 'ADS CORE — Hub',
    roles: ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER'],
    icon: 'Zap',
    group: 'ADS CORE',
  },

  // ── ADS CORE — Ativos & Infraestrutura ────────────────────────────────────
  {
    href: '/dashboard/ads-core/atribuicao',
    label: 'Estoque & Atribuição',
    roles: ['ADMIN', 'PRODUCTION_MANAGER'],
    icon: 'Target',
    group: 'ADS CORE',
  },
  {
    href: '/dashboard/ads-core/nichos',
    label: 'Nichos & Células',
    roles: ['ADMIN', 'PRODUCTION_MANAGER'],
    icon: 'FolderOpen',
    group: 'ADS CORE',
  },
  {
    href: '/dashboard/ads-core/rg-abastecimento',
    label: 'Abastecimento de RG',
    roles: ['ADMIN', 'PRODUCTION_MANAGER'],
    icon: 'Package',
    group: 'ADS CORE',
  },
  {
    href: '/dashboard/base',
    label: 'Base E-mails / CNPJs',
    roles: ['ADMIN', 'PRODUCTION_MANAGER'],
    icon: 'Database',
    group: 'ADS CORE',
  },

  // ── ADS CORE — Monitoramento ──────────────────────────────────────────────
  {
    href: '/dashboard/ads-core/bi',
    label: 'Dashboard de Gestão',
    roles: ['ADMIN', 'PRODUCTION_MANAGER'],
    icon: 'BarChart3',
    group: 'Análise & Relatórios',
  },
  {
    href: '/dashboard/ads-core/demandas',
    label: 'Painel de Demandas',
    roles: ['ADMIN', 'PRODUCTION_MANAGER'],
    icon: 'LayoutList',
    group: 'Análise & Relatórios',
  },
  {
    href: '/dashboard/ads-core/relatorios-producao',
    label: 'Relatórios & Auditoria',
    roles: ['ADMIN', 'PRODUCTION_MANAGER'],
    icon: 'FileBarChart2',
    group: 'Análise & Relatórios',
  },
  {
    href: '/dashboard/ads-core/gestao-contas',
    label: 'Contas MCC',
    roles: ['ADMIN', 'PRODUCTION_MANAGER'],
    icon: 'Layers',
    group: 'Análise & Relatórios',
  },

  // ── Estoque Operacional ───────────────────────────────────────────────────
  {
    href: '/dashboard/ads-core/inventario',
    label: 'Inventário de Estoque',
    roles: ['ADMIN', 'PRODUCTION_MANAGER'],
    icon: 'ClipboardList',
    group: 'Operações',
  },

  // ── Comercial ─────────────────────────────────────────────────────────────
  {
    href: '/dashboard/vendas',
    label: 'Vendas',
    roles: ['ADMIN', 'COMMERCIAL'],
    icon: 'ShoppingCart',
    group: 'Comercial',
  },
  {
    href: '/dashboard/venda-rapida',
    label: 'Venda Rápida PIX',
    menuBadge: 'BR',
    roles: ['ADMIN', 'COMMERCIAL', 'CEO'],
    icon: 'Zap',
    group: 'Comercial',
  },
  {
    href: '/dashboard/venda-rapida-global',
    label: 'Venda Rápida Global',
    menuBadge: 'INTL',
    roles: ['ADMIN', 'COMMERCIAL', 'CEO'],
    icon: 'Globe',
    group: 'Comercial',
  },
  {
    href: '/dashboard/pos-venda',
    label: 'Central de Pós-Venda',
    roles: ['ADMIN', 'CEO', 'COMMERCIAL', 'DELIVERER'],
    icon: 'PackageCheck',
    group: 'Comercial',
  },
  {
    href: '/dashboard/admin/smart-delivery',
    label: 'SmartDeliverySystem (Visao CEO)',
    roles: ['ADMIN', 'COMMERCIAL', 'CEO'],
    icon: 'ShieldAlert',
    group: 'Comercial',
  },
  {
    href: '/dashboard/commercial',
    label: 'Pulmão Comercial',
    roles: ['ADMIN', 'COMMERCIAL'],
    icon: 'Activity',
    group: 'Comercial',
  },
  {
    href: '/dashboard/commercial/seller',
    label: 'Mesa do Vendedor',
    roles: ['ADMIN', 'COMMERCIAL'],
    icon: 'ShoppingCart',
    group: 'Comercial',
  },
  {
    href: '/dashboard/commercial/comissao',
    label: 'Comissão em Tempo Real',
    roles: ['ADMIN', 'CEO', 'COMMERCIAL'],
    icon: 'BadgeDollarSign',
    group: 'Comercial',
  },
  {
    href: '/dashboard/admin/sell-through',
    label: 'Velocidade de Venda',
    roles: ['ADMIN', 'CEO', 'PRODUCTION_MANAGER', 'COMMERCIAL'],
    icon: 'Gauge',
    group: 'Operações',
  },
  {
    href: '/dashboard/commercial/manager',
    label: 'Head of Sales',
    roles: ['ADMIN', 'COMMERCIAL'],
    icon: 'Target',
    group: 'Comercial',
  },
  {
    href: '/dashboard/roi-crm',
    label: 'ROI & CRM',
    roles: ['ADMIN', 'COMMERCIAL'],
    icon: 'LineChart',
    group: 'Comercial',
  },
  {
    href: '/dashboard/intelligence-leads',
    label: 'Inteligência de Leads',
    roles: ['ADMIN', 'COMMERCIAL'],
    icon: 'Brain',
    group: 'Comercial',
  },
  {
    href: '/dashboard/onboarding',
    label: 'Onboarding de Clientes',
    roles: ['ADMIN', 'COMMERCIAL', 'DELIVERER', 'PRODUCER', 'MANAGER'],
    icon: 'UserPlus',
    group: 'Comercial',
  },
  {
    href: '/dashboard/admin/clientes',
    label: 'Cadastro de Clientes (CRM)',
    roles: ['ADMIN', 'CEO', 'COMMERCIAL', 'DELIVERER', 'FINANCE', 'PRODUCER', 'PRODUCTION_MANAGER'],
    icon: 'BookUser',
    group: 'Comercial',
  },
  {
    href: '/dashboard/admin/contestacoes',
    label: 'Contestações',
    roles: ['ADMIN', 'COMMERCIAL'],
    icon: 'AlertCircle',
    group: 'Comercial',
  },
  {
    href: '/dashboard/admin/vendas-pendentes',
    label: 'Vendas Pendentes (KYC)',
    roles: ['ADMIN', 'COMMERCIAL'],
    icon: 'ShieldAlert',
    group: 'Comercial',
  },
  {
    href: '/dashboard/admin/tickets',
    label: 'Tickets & OS',
    roles: ['ADMIN', 'COMMERCIAL'],
    icon: 'Ticket',
    group: 'Comercial',
  },
  {
    href: '/dashboard/admin/solicitacoes',
    label: 'Solicitações de Contas',
    roles: ['ADMIN', 'COMMERCIAL'],
    icon: 'Inbox',
    group: 'Comercial',
  },
  {
    href: '/dashboard/admin/contas-entregues',
    label: 'Contas Entregues',
    roles: ['ADMIN', 'COMMERCIAL'],
    icon: 'CheckCircle',
    group: 'Comercial',
  },

  // ── Logística ─────────────────────────────────────────────────────────────
  {
    href: '/dashboard/entregas',
    label: 'Entregas (Pedidos)',
    roles: ['ADMIN', 'DELIVERER'],
    icon: 'Truck',
    group: 'Logística',
  },
  {
    href: '/dashboard/entregas-grupos',
    label: 'Entregas por Grupo',
    roles: ['ADMIN', 'DELIVERER', 'COMMERCIAL', 'PRODUCER'],
    icon: 'PackageCheck',
    group: 'Logística',
  },
  {
    href: '/dashboard/logistica/plugplay-tracker',
    label: 'Delivery Tracker P&P',
    roles: ['ADMIN', 'DELIVERER', 'COMMERCIAL', 'PRODUCER'],
    icon: 'Truck',
    group: 'Logística',
  },
  {
    href: '/dashboard/admin/delivery-dashboard',
    label: 'Dashboard de Entregas',
    roles: ['ADMIN', 'DELIVERER', 'COMMERCIAL'],
    icon: 'LayoutList',
    group: 'Logística',
  },
  {
    href: '/dashboard/suporte/rma',
    label: 'Suporte — RMA',
    roles: ['ADMIN', 'PRODUCER', 'DELIVERER', 'COMMERCIAL'],
    icon: 'RefreshCw',
    group: 'Logística',
  },

  // ── CEO Command Center ────────────────────────────────────────────────────
  {
    href:  '/dashboard/ceo',
    label: 'CEO Command Center',
    roles: ['ADMIN'],
    icon:  'Trophy',
    group: 'Estratégia',
  },

  // ── Wealth Dashboard (Sócios) — Acesso 100% privado ─────────────────────
  {
    href:  '/dashboard/socio',
    label: '🛡 Wealth Dashboard',
    roles: ['ADMIN'],
    icon:  'Shield',
    group: 'Estratégia',
  },

  // ── Supply Chain ──────────────────────────────────────────────────────────
  {
    href: '/dashboard/compras',
    label: 'Supply Chain & White Label',
    roles: ['ADMIN', 'PURCHASING', 'COMMERCIAL', 'PRODUCTION_MANAGER'],
    icon: 'ShoppingCart',
    group: 'Compras',
  },

  // ── Financeiro ────────────────────────────────────────────────────────────
  {
    href: '/dashboard/financeiro',
    label: 'Financeiro',
    roles: ['ADMIN', 'FINANCE'],
    icon: 'Banknote',
    group: 'Financeiro',
  },
  {
    href: '/dashboard/saques',
    label: 'Saques',
    roles: ['ADMIN', 'FINANCE'],
    icon: 'Wallet',
    group: 'Financeiro',
  },
  {
    href: '/dashboard/estoque',
    label: 'Estoque',
    roles: ['ADMIN', 'FINANCE'],
    icon: 'Package',
    group: 'Financeiro',
  },
  {
    href: '/dashboard/relatorios',
    label: 'Relatórios & KPIs',
    roles: ['ADMIN', 'COMMERCIAL', 'FINANCE'],
    icon: 'BarChart2',
    group: 'Financeiro',
  },
  {
    href: '/dashboard/financeiro/alfredo-fast-entry',
    label: 'ALFREDO Fast-Entry',
    roles: ['ADMIN', 'FINANCE'],
    icon: 'Zap',
    group: 'Financeiro',
  },

  // ── Marketing & Tech ──────────────────────────────────────────────────────
  {
    href: '/dashboard/gtm-conversao',
    label: 'GTM & Conversões',
    roles: ['ADMIN', 'COMMERCIAL', 'DELIVERER', 'PRODUCER', 'MANAGER', 'PLUG_PLAY'],
    icon: 'BarChart2',
    group: 'Marketing & Tech',
  },
  {
    href: '/dashboard/ads-tracker',
    label: 'Ads Tracker',
    roles: ['ADMIN', 'MANAGER'],
    icon: 'Gauge',
    group: 'Marketing & Tech',
  },
  {
    href: '/dashboard/admin/creative-vault',
    label: 'Creative Vault',
    roles: ['ADMIN', 'COMMERCIAL'],
    icon: 'Clapperboard',
    group: 'Marketing & Tech',
  },
  {
    href: '/dashboard/admin/war-room-live',
    label: 'War Room Live',
    roles: ['ADMIN', 'COMMERCIAL'],
    icon: 'Radio',
    group: 'Marketing & Tech',
  },
  {
    href: '/dashboard/admin/live-proof-labs',
    label: 'Live Proof Labs',
    roles: ['ADMIN'],
    icon: 'FlaskConical',
    group: 'Marketing & Tech',
  },

  // ── Administração ─────────────────────────────────────────────────────────
  {
    href: '/dashboard/admin',
    label: 'Painel Admin',
    roles: ['ADMIN'],
    icon: 'Shield',
    group: 'Administração',
  },
  {
    href: '/dashboard/admin/usuarios',
    label: 'Usuários',
    roles: ['ADMIN'],
    icon: 'Users',
    group: 'Administração',
  },
  {
    href: '/dashboard/admin/fornecedores',
    label: 'Fornecedores',
    roles: ['ADMIN'],
    icon: 'Store',
    group: 'Administração',
  },
  {
    href: '/dashboard/admin/contas-ofertadas',
    label: 'Contas Ofertadas',
    roles: ['ADMIN'],
    icon: 'Gift',
    group: 'Administração',
  },
  {
    href: '/dashboard/admin/inventario-express',
    label: 'Inventário Express',
    roles: ['ADMIN', 'PRODUCTION_MANAGER'],
    icon: 'Rocket',
    group: 'Operações',
  },
  {
    href: '/dashboard/admin/rma',
    label: 'Trocas & RMA',
    roles: ['ADMIN', 'PRODUCTION_MANAGER', 'COMMERCIAL', 'DELIVERER'],
    icon: 'ShieldAlert',
    group: 'Operações',
  },
  {
    href: '/dashboard/admin/fechamento-producao',
    label: 'Fechamento de Produção',
    roles: ['ADMIN'],
    icon: 'FileCheck',
    group: 'Administração',
  },
  {
    href: '/dashboard/admin/black',
    label: 'Plug & Play Black',
    roles: ['ADMIN'],
    icon: 'Zap',
    group: 'Administração',
  },

  // ── Configurações & Sistema ────────────────────────────────────────────────
  {
    href: '/dashboard/admin/config',
    label: 'Configurações',
    roles: ['ADMIN'],
    icon: 'Settings',
    group: 'Sistema',
  },
  {
    href: '/dashboard/admin/integracoes',
    label: 'Integrações',
    roles: ['ADMIN'],
    icon: 'Plug',
    group: 'Sistema',
  },
  {
    href: '/dashboard/admin/provisioning',
    label: 'Provisioning Engine',
    roles: ['ADMIN'],
    icon: 'Globe',
    group: 'Sistema',
  },
  {
    href: '/dashboard/admin/ceo',
    label: 'Centro de Comando CEO',
    roles: ['ADMIN'],
    icon: 'Crown',
    group: 'Sistema',
  },
  {
    href: '/dashboard/admin/war-room',
    label: 'War Room',
    roles: ['ADMIN'],
    icon: 'Radio',
    group: 'Sistema',
  },
  {
    href: '/dashboard/admin/automation-os',
    label: 'Automation OS',
    roles: ['ADMIN'],
    icon: 'Cpu',
    group: 'Sistema',
  },
  {
    href: '/dashboard/admin/guard',
    label: 'Ads Ativos Guard',
    roles: ['ADMIN'],
    icon: 'Shield',
    group: 'Sistema',
  },
  {
    href: '/dashboard/admin/pix',
    label: 'Tesouraria Multimoeda',
    roles: ['ADMIN', 'CEO'],
    icon: 'Landmark',
    group: 'Financeiro',
  },
  {
    href: '/dashboard/admin/profit-engine',
    label: 'Profit Engine',
    roles: ['ADMIN'],
    icon: 'Zap',
    group: 'Sistema',
  },
  {
    href: '/dashboard/admin/simuladores',
    label: 'Simuladores',
    roles: ['ADMIN'],
    icon: 'Calculator',
    group: 'Sistema',
  },
  {
    href: '/dashboard/admin/dashboards?setor=producao',
    label: 'Dashboards Inteligentes',
    roles: ['ADMIN', 'PRODUCER', 'COMMERCIAL', 'DELIVERER'],
    icon: 'LayoutGrid',
    group: 'Sistema',
  },
  {
    href: '/dashboard/admin/backup',
    label: 'Backup de Dados',
    roles: ['ADMIN'],
    icon: 'Archive',
    group: 'Sistema',
  },
  {
    href: '/dashboard/admin/deploy',
    label: 'Agente de Deploy',
    roles: ['ADMIN'],
    icon: 'Rocket',
    group: 'Sistema',
  },
  {
    href: '/dashboard/admin/relatorio-diario',
    label: 'Relatório Diário',
    roles: ['ADMIN'],
    icon: 'FileText',
    group: 'Sistema',
  },

  // ── Treinamento & Feedback ────────────────────────────────────────────────
  {
    href: '/dashboard/treinamento',
    label: 'Treinamento Blindado',
    roles: ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER', 'FINANCE', 'DELIVERER', 'COMMERCIAL', 'MANAGER'],
    icon: 'FileText',
    group: 'Treinamento',
  },
  {
    href: '/dashboard/admin/sugestoes',
    label: 'Sugestões (Admin)',
    roles: ['ADMIN'],
    icon: 'Lightbulb',
    group: 'Treinamento',
  },
  {
    href: '/dashboard/sugestoes?tipo=sistema',
    label: 'Sugerir Melhoria',
    roles: ['ADMIN', 'PRODUCER', 'FINANCE', 'DELIVERER', 'COMMERCIAL', 'MANAGER', 'PRODUCTION_MANAGER', 'PLUG_PLAY'],
    icon: 'MessageCircle',
    group: 'Treinamento',
  },
]

export const MODULES_CLIENTE: NavItem[] = [
  { href: '/dashboard/cliente', label: 'Minha Área', labelKey: 'nav.home', roles: ['CLIENT'], icon: 'Home', group: 'Início' },
  { href: '/dashboard/cliente/manual', label: 'Manual do Operador', labelKey: 'nav.operatorManual', roles: ['CLIENT'], icon: 'BookOpen', group: 'Início' },
  { href: '/dashboard/cliente/gamificacao', label: 'Hall de Patentes', labelKey: 'nav.gamification', roles: ['CLIENT'], icon: 'Trophy', group: 'Início' },

  { href: '/dashboard/cliente/solicitar', label: 'Solicitar Contas', labelKey: 'nav.request', roles: ['CLIENT'], icon: 'PlusCircle', group: 'Contas' },
  { href: '/dashboard/cliente/pesquisar', label: 'Pesquisar Contas', labelKey: 'nav.search', roles: ['CLIENT'], icon: 'Search', group: 'Contas' },
  { href: '/dashboard/cliente/compras', label: 'Minhas Compras', labelKey: 'nav.purchases', roles: ['CLIENT'], icon: 'ShoppingBag', group: 'Contas' },
  { href: '/dashboard/cliente/contas', label: 'Minhas Contas', labelKey: 'nav.accounts', roles: ['CLIENT'], icon: 'FolderOpen', group: 'Contas' },
  { href: '/dashboard/cliente/armory', label: 'Central de Ativos', labelKey: 'nav.armory', roles: ['CLIENT'], icon: 'Wrench', group: 'Contas' },

  { href: '/dashboard/cliente/entregas', label: 'Minhas Entregas', labelKey: 'nav.deliveries', roles: ['CLIENT'], icon: 'Truck', group: 'Suporte' },
  { href: '/dashboard/cliente/contestacoes', label: 'Contestações', labelKey: 'nav.disputes', roles: ['CLIENT'], icon: 'AlertCircle', group: 'Suporte' },
  { href: '/dashboard/cliente/reposicao', label: 'Reposição (RMA)', labelKey: 'nav.rma', roles: ['CLIENT'], icon: 'RefreshCw', group: 'Suporte' },
  { href: '/dashboard/cliente/suporte', label: 'Suporte', labelKey: 'nav.support', roles: ['CLIENT'], icon: 'MessageCircle', group: 'Suporte' },

  { href: '/dashboard/cliente/creative-vault', label: 'Creative Vault', labelKey: 'nav.creativeVault', roles: ['CLIENT'], icon: 'Clapperboard', group: 'Recursos' },
  { href: '/dashboard/cliente/live-proof-labs', label: 'Live Proof Labs', labelKey: 'nav.liveProofLabs', roles: ['CLIENT'], icon: 'FlaskConical', group: 'Recursos' },
  { href: '/dashboard/cliente/shield-tracker', label: 'Shield & Tracker', labelKey: 'nav.shieldTracker', roles: ['CLIENT'], icon: 'Shield', group: 'Recursos' },
  { href: '/dashboard/cliente/profit-board', label: 'Profit Board', labelKey: 'nav.profitBoard', roles: ['CLIENT'], icon: 'LineChart', group: 'Recursos' },
  { href: '/dashboard/cliente/ads-war-room', label: 'War Room — Ads', labelKey: 'nav.warRoomAds', roles: ['CLIENT'], icon: 'Radio', group: 'Recursos' },
  { href: '/dashboard/cliente/war-room-live', label: 'War Room Live', labelKey: 'nav.warRoomLive', roles: ['CLIENT'], icon: 'Radio', group: 'Recursos' },
  { href: '/dashboard/cliente/landing', label: 'Fábrica de Landing Pages', labelKey: 'nav.landing', roles: ['CLIENT'], icon: 'Rocket', group: 'Recursos' },
  { href: '/dashboard/ecosystem', label: 'Infraestrutura de Guerra', labelKey: 'nav.ecosystem', roles: ['CLIENT'], icon: 'Crosshair', group: 'Recursos' },
  { href: '/dashboard/area-cliente', label: 'Gerador de Ativos', labelKey: 'nav.assets', roles: ['CLIENT'], icon: 'Rocket', group: 'Recursos' },
  { href: '/dashboard/cliente/gtm', label: 'GTM & Conversões', labelKey: 'nav.gtm', roles: ['CLIENT'], icon: 'BarChart2', group: 'Recursos' },

  { href: '/dashboard/cliente/perfil', label: 'Meu Perfil', labelKey: 'nav.profile', roles: ['CLIENT'], icon: 'User', group: 'Conta' },
  { href: '/dashboard/sugestoes?tipo=sistema', label: 'Sugerir Melhoria', labelKey: 'nav.suggestSystem', roles: ['CLIENT'], icon: 'Lightbulb', group: 'Conta' },
]

export const MODULES_GESTOR: NavItem[] = [
  { href: '/dashboard/gestor', label: 'Dashboard', roles: ['MANAGER'], icon: 'LayoutDashboard', group: 'Início' },
  { href: '/dashboard/gestor/lancar', label: 'Lançar Conta', roles: ['MANAGER'], icon: 'Plus', group: 'Gestão' },
  { href: '/dashboard/gestor/contas', label: 'Gerenciar Contas', roles: ['MANAGER'], icon: 'FolderOpen', group: 'Gestão' },
  { href: '/dashboard/gestor/relatorios', label: 'Relatórios', roles: ['MANAGER'], icon: 'BarChart2', group: 'Gestão' },
  { href: '/dashboard/sugestoes?tipo=sistema', label: 'Sugerir Melhoria', roles: ['MANAGER'], icon: 'Lightbulb', group: 'Geral' },
]

export const MODULES_PLUGPLAY: NavItem[] = [
  { href: '/dashboard/plugplay', label: 'Plug & Play Black', roles: ['PLUG_PLAY'], icon: 'Zap', group: 'Início' },
  { href: '/dashboard/plugplay/saldo', label: 'Saldo e Saque', roles: ['PLUG_PLAY'], icon: 'Wallet', group: 'Início' },
  { href: '/dashboard/sugestoes?tipo=sistema', label: 'Sugerir Melhoria', roles: ['PLUG_PLAY'], icon: 'Lightbulb', group: 'Geral' },
]

function isCommercialManagerCargo(cargo?: string | null): boolean {
  const c = (cargo || '').trim().toUpperCase()
  if (!c) return false
  return c.includes('GERENTE') || c.includes('HEAD') || c === 'MANAGER'
}

export function getModulesForRole(role?: string, cargo?: string | null): NavItem[] {
  const list =
    role === 'CLIENT'
      ? MODULES_CLIENTE
      : role === 'MANAGER'
        ? MODULES_GESTOR
        : role === 'PLUG_PLAY'
          ? MODULES_PLUGPLAY
          : MODULES_ERP

  const roleFiltered = list.filter((m) => !role || m.roles.includes(role))
  if (role !== 'COMMERCIAL') return roleFiltered

  const canSeeManagerModule = isCommercialManagerCargo(cargo)
  return roleFiltered.filter((m) => {
    if (canSeeManagerModule) {
      return m.href !== '/dashboard/commercial/seller'
    }
    if (m.href === '/dashboard/commercial') return false
    if (m.href === '/dashboard/commercial/manager') return false
    return true
  })
}
