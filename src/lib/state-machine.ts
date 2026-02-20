/**
 * Controle de transições de status (State Machine).
 * Garante fluxo lógico e impede saltos inválidos.
 */

/** Transições permitidas: de Status → para Status[] */
export type Transitions<T extends string> = Record<T, T[]>

/** Produção clássica */
export const PRODUCTION_ACCOUNT_TRANSITIONS: Transitions<string> = {
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: [],
  REJECTED: [],
  IN_USE: ['AVAILABLE', 'DELIVERED', 'CRITICAL'],
  AVAILABLE: ['IN_USE', 'DELIVERED', 'CRITICAL'],
  CRITICAL: ['IN_USE', 'AVAILABLE', 'DELIVERED'],
  DELIVERED: [],
}

/** Produção G2 */
export const PRODUCTION_G2_TRANSITIONS: Transitions<string> = {
  PARA_CRIACAO: ['CRIANDO_GMAIL'],
  CRIANDO_GMAIL: ['CRIANDO_GOOGLE_ADS', 'PARA_CRIACAO'],
  CRIANDO_GOOGLE_ADS: ['VINCULANDO_CNPJ', 'CRIANDO_GMAIL'],
  VINCULANDO_CNPJ: ['CONFIGURANDO_PERFIL_PAGAMENTO', 'CRIANDO_GOOGLE_ADS'],
  CONFIGURANDO_PERFIL_PAGAMENTO: ['EM_REVISAO', 'VINCULANDO_CNPJ'],
  EM_REVISAO: ['APROVADA', 'REPROVADA'],
  APROVADA: ['ENVIADA_ESTOQUE'],
  REPROVADA: ['EM_REVISAO', 'ARQUIVADA'],
  ENVIADA_ESTOQUE: ['ARQUIVADA'],
  ARQUIVADA: [],
}

/** Pedido (Order) */
export const ORDER_TRANSITIONS: Transitions<string> = {
  QUOTE: ['AWAITING_PAYMENT', 'CANCELLED'],
  AWAITING_PAYMENT: ['PAID', 'PENDING', 'CANCELLED'],
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['PAID'],
  REJECTED: ['CANCELLED'],
  PAID: ['IN_SEPARATION'],
  IN_SEPARATION: ['IN_DELIVERY'],
  IN_DELIVERY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
}

/** Grupo de entrega */
export const DELIVERY_GROUP_TRANSITIONS: Transitions<string> = {
  AGUARDANDO_INICIO: ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['PARCIALMENTE_ENTREGUE', 'FINALIZADA', 'ATRASADA', 'EM_REPOSICAO', 'CANCELADA'],
  PARCIALMENTE_ENTREGUE: ['FINALIZADA', 'ATRASADA', 'EM_REPOSICAO'],
  FINALIZADA: [],
  ATRASADA: ['EM_ANDAMENTO', 'PARCIALMENTE_ENTREGUE', 'FINALIZADA', 'EM_REPOSICAO'],
  EM_REPOSICAO: ['EM_ANDAMENTO', 'PARCIALMENTE_ENTREGUE', 'FINALIZADA'],
  CANCELADA: [],
}

/** Reposição */
export const REPOSITION_TRANSITIONS: Transitions<string> = {
  SOLICITADA: ['APROVADA', 'NEGADA'],
  APROVADA: ['CONCLUIDA'],
  NEGADA: [],
  CONCLUIDA: [],
}

export function canTransition<T extends string>(
  transitions: Transitions<T>,
  from: T,
  to: T
): boolean {
  const allowed = transitions[from]
  if (!allowed || allowed.length === 0) return false
  return allowed.includes(to)
}

export function validateTransition<T extends string>(
  transitions: Transitions<T>,
  from: T,
  to: T
): { ok: true } | { ok: false; reason: string } {
  if (from === to) return { ok: true }
  if (canTransition(transitions, from, to)) return { ok: true }
  return {
    ok: false,
    reason: `Transição inválida: ${from} → ${to}`,
  }
}
