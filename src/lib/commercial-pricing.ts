import { prisma } from './prisma'

export async function getCommercialVolumeDiscountPercent(quantity: number): Promise<number> {
  const [minRow, pctRow] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: 'commercial_lote_qty_min' } }),
    prisma.systemSetting.findUnique({ where: { key: 'commercial_lote_discount_pct' } }),
  ])
  const minQty = minRow ? parseInt(minRow.value, 10) : 50
  const pct = pctRow ? parseInt(pctRow.value, 10) : 15
  if (!Number.isFinite(minQty) || minQty <= 0) return 0
  if (quantity < minQty) return 0
  return Number.isFinite(pct) && pct > 0 ? Math.min(90, pct) : 0
}

/** Aplica desconto por volume ao valor (BRL). */
export function applyPercentDiscount(value: number, discountPercent: number): number {
  if (discountPercent <= 0) return value
  const v = Math.round(value * (100 - discountPercent) * 100) / 10000
  return Math.max(0, v)
}
