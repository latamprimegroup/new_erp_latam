/** Prazo de garantia pós-pagamento e status derivado para vendas de ativos. */

export function computeWarrantyEndsAt(paidAt: Date, warrantyHours: number): Date {
  const h = Number.isFinite(warrantyHours) && warrantyHours > 0 ? warrantyHours : 48
  return new Date(paidAt.getTime() + h * 60 * 60 * 1000)
}

export type WarrantyUiStatus = 'SEM_PAGAMENTO' | 'VIGENTE' | 'EXPIRADA' | 'REIVINDICADA'

export function getOrderWarrantyUiStatus(input: {
  paidAt: Date | null
  warrantyEndsAt: Date | null
  hasReplacementLinked: boolean
  now?: Date
}): WarrantyUiStatus {
  const now = input.now ?? new Date()
  if (!input.paidAt || !input.warrantyEndsAt) return 'SEM_PAGAMENTO'
  if (input.hasReplacementLinked) return 'REIVINDICADA'
  if (now.getTime() > input.warrantyEndsAt.getTime()) return 'EXPIRADA'
  return 'VIGENTE'
}
