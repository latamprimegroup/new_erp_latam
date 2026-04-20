/** Erro crítico de unicidade / cruzamento (Protocolo de Ingestão Blindada). */
export const GATEKEEPER_CROSSING_ERROR =
  'RISCO DE CRUZAMENTO DE DADOS: OPERAÇÃO BLOQUEADA' as const

/**
 * Duplicidade no cofre ou base histórica:
 * - Prisma `P2002` em `cpf`, `cnpj`, `email`, `photo_hash`, `card_pan_hash` → mapeado para GATEKEEPER_CROSSING_ERROR nas rotas.
 * - Pré-check em `uniqueness-guard` dispara `GatekeeperBlockedError` antes do INSERT.
 */

export class GatekeeperBlockedError extends Error {
  constructor(message: string = GATEKEEPER_CROSSING_ERROR) {
    super(message)
    this.name = 'GatekeeperBlockedError'
  }
}
