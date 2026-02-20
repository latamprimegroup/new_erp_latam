/**
 * Valuation automático - Conservador, Moderado, Agressivo
 * Múltiplos de receita e DCF simplificado
 */
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'

export async function computeValuation(): Promise<void> {
  const refDate = new Date()
  refDate.setHours(0, 0, 0, 0)
  const oneYearAgo = new Date(refDate)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const orders = await prisma.order.findMany({
    where: {
      status: 'DELIVERED',
      paidAt: { not: null, gte: oneYearAgo },
    },
    select: { value: true },
  })

  const revenue12m = orders.reduce((s, o) => s + Number(o.value), 0)
  const ebitda12m = revenue12m * 0.25

  const multipleConservador = 1.5
  const multipleModerado = 2.5
  const multipleAgressivo = 4

  const valuationConservador = revenue12m * multipleConservador
  const valuationModerado = revenue12m * multipleModerado
  const valuationAgressivo = revenue12m * multipleAgressivo

  await prisma.valuationSnapshot.upsert({
    where: { referenceDate: refDate },
    create: {
      referenceDate: refDate,
      revenue12m: new Decimal(revenue12m),
      ebitda12m: new Decimal(ebitda12m),
      valuationConservador: new Decimal(valuationConservador),
      valuationModerado: new Decimal(valuationModerado),
      valuationAgressivo: new Decimal(valuationAgressivo),
      multipleRevenue: new Decimal(multipleModerado),
      multipleEbitda: new Decimal(6),
    },
    update: {
      revenue12m: new Decimal(revenue12m),
      ebitda12m: new Decimal(ebitda12m),
      valuationConservador: new Decimal(valuationConservador),
      valuationModerado: new Decimal(valuationModerado),
      valuationAgressivo: new Decimal(valuationAgressivo),
    },
  })
}
