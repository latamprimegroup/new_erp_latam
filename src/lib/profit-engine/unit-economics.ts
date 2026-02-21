/**
 * Unit Economics por tipo de conta
 */
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'

export async function computeUnitEconomics(): Promise<number> {
  const refDate = new Date()
  refDate.setHours(0, 0, 0, 0)
  const startOfMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 1)

  const [orders, metrics, expenses] = await Promise.all([
    prisma.order.findMany({
      where: { status: 'DELIVERED', paidAt: { not: null, gte: startOfMonth } },
      select: { id: true, value: true, quantity: true, accountType: true, currency: true },
    }),
    prisma.customerMetrics.findMany({
      where: { referenceDate: refDate },
      select: { tipoConta: true, moeda: true, revenueTotal: true, costTotal: true, marginTotal: true, cac: true, ltvReal: true, paybackMeses: true },
    }),
    prisma.financialEntry.findMany({
      where: { type: 'EXPENSE', date: { gte: startOfMonth } },
      select: { value: true, orderId: true },
    }),
  ])

  const byTipoMoeda = new Map<string, { receita: number; quantidade: number; custo: number }>()
  for (const o of orders) {
    const key = `${o.accountType ?? 'N/A'}_${o.currency ?? 'BRL'}`
    const cur = byTipoMoeda.get(key) ?? { receita: 0, quantidade: 0, custo: 0 }
    cur.receita += Number(o.value)
    cur.quantidade += o.quantity || 1
    byTipoMoeda.set(key, cur)
  }

  const custoPorOrder = new Map<string, number>()
  for (const e of expenses) {
    if (e.orderId) {
      custoPorOrder.set(e.orderId, (custoPorOrder.get(e.orderId) ?? 0) + Number(e.value))
    }
  }

  const custoPorTipo = new Map<string, number>()
  for (const o of orders) {
    const custo = custoPorOrder.get(o.id) ?? 0
    const key = `${o.accountType ?? 'N/A'}_${o.currency ?? 'BRL'}`
    custoPorTipo.set(key, (custoPorTipo.get(key) ?? 0) + custo)
  }

  const avgByTipo = new Map<string, { ltv: number; cac: number; payback: number; count: number }>()
  for (const m of metrics) {
    const key = `${m.tipoConta ?? 'N/A'}_${m.moeda ?? 'BRL'}`
    const cur = avgByTipo.get(key) ?? { ltv: 0, cac: 0, payback: 0, count: 0 }
    cur.ltv += Number(m.ltvReal ?? 0)
    cur.cac += Number(m.cac ?? 0)
    cur.payback += Number(m.paybackMeses ?? 0)
    cur.count++
    avgByTipo.set(key, cur)
  }

  let count = 0
  for (const [key, data] of Array.from(byTipoMoeda.entries())) {
    const [tipoConta, moeda] = key.split('_')
    const receitaPorUnidade = data.quantidade > 0 ? data.receita / data.quantidade : 0
    const custoTotalTipo = custoPorTipo.get(key) ?? 0
    const custoPorUnidade = data.quantidade > 0 ? custoTotalTipo / data.quantidade : 0
    const margemPorUnidade = receitaPorUnidade - custoPorUnidade
    const margemNegativa = margemPorUnidade < 0

    const avg = avgByTipo.get(key)
    const ltvReal = avg && avg.count > 0 ? avg.ltv / avg.count : null
    const cacReal = avg && avg.count > 0 ? avg.cac / avg.count : null
    const payback = avg && avg.count > 0 ? avg.payback / avg.count : null

    const scoreRentabilidade = margemNegativa ? 0 : receitaPorUnidade > 0
      ? Math.min(100, Math.round((margemPorUnidade / receitaPorUnidade) * 100))
      : 0

    await prisma.unitEconomicsSnapshot.upsert({
      where: { referenceDate_tipoConta_moeda: { referenceDate: refDate, tipoConta, moeda } },
      create: {
        referenceDate: refDate,
        tipoConta,
        moeda,
        receitaPorUnidade: new Decimal(receitaPorUnidade),
        custoPorUnidade: new Decimal(custoPorUnidade),
        margemPorUnidade: new Decimal(margemPorUnidade),
        cacReal: cacReal != null ? new Decimal(cacReal) : null,
        ltvReal: ltvReal != null ? new Decimal(ltvReal) : null,
        payback: payback != null ? new Decimal(payback) : null,
        scoreRentabilidade,
        margemNegativa,
      },
      update: {
        receitaPorUnidade: new Decimal(receitaPorUnidade),
        custoPorUnidade: new Decimal(custoPorUnidade),
        margemPorUnidade: new Decimal(margemPorUnidade),
        cacReal: cacReal != null ? new Decimal(cacReal) : null,
        ltvReal: ltvReal != null ? new Decimal(ltvReal) : null,
        payback: payback != null ? new Decimal(payback) : null,
        scoreRentabilidade,
        margemNegativa,
      },
    })
    count++
  }
  return count
}
