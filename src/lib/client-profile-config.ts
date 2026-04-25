/**
 * Ads Ativos Global — Motor de RBAC por Perfil de Cliente
 *
 * Define módulos, temas e permissões para cada ClientProfileType.
 * O DashboardWrapper lê este arquivo para renderizar a interface correta.
 */

export type ClientProfileType =
  | 'TRADER_WHATSAPP'
  | 'LOCAL_BUSINESS'
  | 'MENTORADO'
  | 'DIRECT_RESPONSE_SCALE'
  | 'INFRA_PARTNER'
  | 'RENTAL_USER'

// ─── Módulos disponíveis ──────────────────────────────────────────────────────

export type ModuleKey =
  | 'store'           // Vitrine de ativos
  | 'orders'          // Histórico de pedidos
  | 'rma'             // Reposição / troca automática
  | 'support'         // Suporte / concierge
  | 'war_room'        // Ads War Room (UNIs)
  | 'creative_vault'  // Banco de criativos
  | 'tracking'        // Shield & Tracker (links blindados)
  | 'live_proof'      // Live Proof Labs (réplicas)
  | 'domains'         // Gestão de domínios
  | 'spend_monitor'   // Monitor de spend em tempo real
  | 'infra_panel'     // Painel de infraestrutura isolada
  | 'ltv_dashboard'   // Dashboard de LTV e escalabilidade
  | 'mentorship'      // Área de mentorias (templates, ofertas validadas)
  | 'gamification'    // Patentes e gamificação
  | 'profit_board'    // Profit Board (financeiro do cliente)

// ─── Definição de cada módulo ─────────────────────────────────────────────────

export type ModuleDef = {
  key:   ModuleKey
  label: string
  icon:  string
  path:  string
  /** Badge opcional no menu */
  badge?: string
}

export const ALL_MODULES: ModuleDef[] = [
  { key: 'store',          label: 'Vitrine de Ativos',       icon: '🛒', path: '/dashboard/cliente/compras' },
  { key: 'orders',         label: 'Meus Pedidos',            icon: '📦', path: '/dashboard/cliente/entregas' },
  { key: 'rma',            label: 'Troca Automática',        icon: '🔄', path: '/dashboard/cliente/reposicao' },
  { key: 'support',        label: 'Suporte VIP',             icon: '🎧', path: '/dashboard/cliente/suporte' },
  { key: 'war_room',       label: 'War Room',                icon: '🎯', path: '/dashboard/cliente/ads-war-room' },
  { key: 'creative_vault', label: 'Creative Vault',          icon: '🎨', path: '/dashboard/cliente/creative-vault' },
  { key: 'tracking',       label: 'Shield & Tracker',        icon: '🛡️', path: '/dashboard/cliente/shield-tracker' },
  { key: 'live_proof',     label: 'Live Proof Labs',         icon: '⚡', path: '/dashboard/cliente/live-proof-labs', badge: 'NOVO' },
  { key: 'domains',        label: 'Domínios & Infra',        icon: '🌐', path: '/dashboard/cliente/landing' },
  { key: 'spend_monitor',  label: 'Monitor de Spend',        icon: '📊', path: '/dashboard/cliente/armory' },
  { key: 'infra_panel',    label: 'Painel de Infra',         icon: '🔧', path: '/dashboard/cliente/armory' },
  { key: 'ltv_dashboard',  label: 'Dashboard de Escala',     icon: '📈', path: '/dashboard/cliente/profit-board' },
  { key: 'mentorship',     label: 'Área de Mentorias',       icon: '🎓', path: '/dashboard/cliente/manual' },
  { key: 'gamification',   label: 'Gamificação & Patentes',  icon: '🏆', path: '/dashboard/cliente/gamificacao' },
  { key: 'profit_board',   label: 'Profit Board',            icon: '💰', path: '/dashboard/cliente/profit-board' },
]

// ─── Módulos por perfil ───────────────────────────────────────────────────────

export const PROFILE_MODULES: Record<ClientProfileType, ModuleKey[]> = {
  TRADER_WHATSAPP: [
    'store', 'orders', 'rma', 'support',
  ],
  LOCAL_BUSINESS: [
    'store', 'orders', 'rma', 'support', 'tracking', 'profit_board',
  ],
  MENTORADO: [
    'store', 'orders', 'rma', 'support',
    'war_room', 'creative_vault', 'tracking', 'live_proof',
    'mentorship', 'gamification', 'profit_board',
  ],
  DIRECT_RESPONSE_SCALE: [
    'store', 'orders', 'rma', 'support',
    'war_room', 'tracking', 'ltv_dashboard', 'profit_board', 'gamification',
  ],
  INFRA_PARTNER: [
    'store', 'orders', 'rma', 'support',
    'domains', 'infra_panel', 'spend_monitor', 'profit_board',
  ],
  RENTAL_USER: [
    'orders', 'rma', 'support', 'spend_monitor',
  ],
}

// ─── Temas por perfil ─────────────────────────────────────────────────────────

export type ProfileTheme = {
  /** Classe CSS a adicionar ao wrapper (define variáveis CSS) */
  themeClass: string
  /** Rótulo exibido no badge de perfil */
  label:      string
  /** Emoji do perfil */
  emoji:      string
  /** Cor de destaque (Tailwind / hex) para o menu ativo */
  accentHex:  string
  /** Gradiente do header da sidebar */
  headerGradient: string
  /** Descrição curta para o painel */
  description: string
}

export const PROFILE_THEMES: Record<ClientProfileType, ProfileTheme> = {
  TRADER_WHATSAPP: {
    themeClass:     'theme-trader',
    label:          'Trader',
    emoji:          '📱',
    accentHex:      '#10b981',
    headerGradient: 'from-emerald-900 to-zinc-900',
    description:    'Acesso à vitrine e histórico de compras.',
  },
  LOCAL_BUSINESS: {
    themeClass:     'theme-local',
    label:          'Local Business',
    emoji:          '🏪',
    accentHex:      '#3b82f6',
    headerGradient: 'from-blue-900 to-zinc-900',
    description:    'Gestão de anúncios para pequenos negócios.',
  },
  MENTORADO: {
    themeClass:     'theme-mentorado',
    label:          'Mentorado VIP',
    emoji:          '🎓',
    accentHex:      '#d4af37',  // Dourado
    headerGradient: 'from-yellow-900/60 to-zinc-900',
    description:    'Acesso completo — infraestrutura de elite.',
  },
  DIRECT_RESPONSE_SCALE: {
    themeClass:     'theme-scale',
    label:          'Scale',
    emoji:          '📈',
    accentHex:      '#8b5cf6',
    headerGradient: 'from-violet-900 to-zinc-900',
    description:    'Operador em escala — volume e LTV.',
  },
  INFRA_PARTNER: {
    themeClass:     'theme-infra',
    label:          'Infra Partner',
    emoji:          '🔧',
    accentHex:      '#06b6d4',  // Ciano tech
    headerGradient: 'from-cyan-900 to-zinc-900',
    description:    'Parceiro de infraestrutura — painel técnico.',
  },
  RENTAL_USER: {
    themeClass:     'theme-rental',
    label:          'Aluguel',
    emoji:          '⏱️',
    accentHex:      '#f59e0b',
    headerGradient: 'from-amber-900 to-zinc-900',
    description:    'Monitoramento de spend e setup de conta.',
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Retorna os módulos efetivos para um cliente.
 * Se `customModules` (activeModules do DB) for não-vazio, usa-o como override.
 * Caso contrário, usa os módulos padrão do perfil.
 */
export function resolveClientModules(
  profileType: ClientProfileType,
  customModules: string[],
): ModuleDef[] {
  const keys: ModuleKey[] =
    customModules.length > 0
      ? (customModules as ModuleKey[])
      : PROFILE_MODULES[profileType]

  return ALL_MODULES.filter((m) => keys.includes(m.key))
}

/**
 * Verifica se um cliente tem acesso a um módulo específico.
 */
export function hasModule(
  profileType: ClientProfileType,
  customModules: string[],
  moduleKey: ModuleKey,
): boolean {
  const keys: string[] =
    customModules.length > 0
      ? customModules
      : PROFILE_MODULES[profileType]
  return keys.includes(moduleKey)
}

/** Labels para exibição no Admin */
export const PROFILE_TYPE_LABELS: Record<ClientProfileType, string> = {
  TRADER_WHATSAPP:       '📱 Trader WhatsApp',
  LOCAL_BUSINESS:        '🏪 Local Business (SaaS)',
  MENTORADO:             '🎓 Mentorado VIP',
  DIRECT_RESPONSE_SCALE: '📈 Direct Response Scale',
  INFRA_PARTNER:         '🔧 Infra Partner',
  RENTAL_USER:           '⏱️ Aluguel de Conta',
}
