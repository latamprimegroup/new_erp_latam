/**
 * Proteção de dados: soft delete e filtros globais.
 * Regra: NUNCA apagar fisicamente contas de produção/estoque.
 * Usar deletedAt para "remoção" lógica.
 */

export const SOFT_DELETE_FILTER = { deletedAt: null }

/** Where para StockAccount (exclui soft-deleted) */
export function stockAccountWhere(extra: Record<string, unknown> = {}) {
  return { ...extra, deletedAt: null }
}

/** Where para ProductionG2 (exclui soft-deleted) */
export function productionG2Where(extra: Record<string, unknown> = {}) {
  return { ...extra, deletedAt: null }
}

/** Where para ProductionAccount (exclui soft-deleted) */
export function productionAccountWhere(extra: Record<string, unknown> = {}) {
  return { ...extra, deletedAt: null }
}

/** Where para StockAccountCredential (exclui soft-deleted) */
export function stockAccountCredentialWhere(extra: Record<string, unknown> = {}) {
  return { ...extra, deletedAt: null }
}
