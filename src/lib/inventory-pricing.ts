/**
 * Precificação BRL: margem sobre custo (fornecedor) com override manual de salePrice.
 */
export function salePriceFromCostAndMargin(purchasePriceBrl: number, markupPercent: number): number {
  if (purchasePriceBrl < 0 || !Number.isFinite(purchasePriceBrl)) return 0
  const m = Math.max(0, markupPercent)
  return Math.round(purchasePriceBrl * (1 + m / 100) * 100) / 100
}
