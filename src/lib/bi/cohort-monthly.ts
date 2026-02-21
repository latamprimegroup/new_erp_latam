/**
 * Análise de coorte mensal detalhada
 * receita_mes_1, receita_mes_2, retenção, margem por coorte
 */
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'

export async function computeCohortMonthly(): Promise<number> {
  const refDate = new Date()
  refDate.setHours(0, 0, 0, 0)

  const orders = await prisma.order.findMany({
    where: { status: { in: ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] }, paidAt: { not: null } },
    select: { clientId: true, value: true, paidAt: true },
  })

  // Agrupar por cliente
  const byClient = new Map<string, { firstPaid: Date; orders: { value: number; paidAt: Date }[] }>()
  for (const o of orders) {
    const paidAt = o.paidAt!
    const value = Number(o.value)
    const cur = byClient.get(o.clientId)
    if (!cur) {
      byClient.set(o.clientId, { firstPaid: paidAt, orders: [{ value, paidAt }] })
    } else {
      if (paidAt.getTime() < cur.firstPaid.getTime()) cur.firstPaid = paidAt
      cur.orders.push({ value, paidAt })
    }
  }

  // Agrupar por coorte (mês de aquisição)
  const cohortMap = new Map<string, { clients: string[]; orders: Map<string, { value: number; paidAt: Date }[]> }>()
  for (const [clientId, data] of Array.from(byClient.entries())) {
    const cohortMonth = new Date(data.firstPaid.getFullYear(), data.firstPaid.getMonth(), 1)
    const key = cohortMonth.toISOString().slice(0, 7)
    const existing = cohortMap.get(key) ?? { clients: [] as string[], orders: new Map<string, { value: number; paidAt: Date }[]>() }
    existing.clients.push(clientId)
    for (const o of data.orders) {
      const list = existing.orders.get(clientId) ?? []
      list.push(o)
      existing.orders.set(clientId, list)
    }
    cohortMap.set(key, existing)
  }

  const now = new Date()
  let count = 0
  for (const [key, data] of Array.from(cohortMap.entries())) {
    const [y, m] = key.split('-').map(Number)
    const mesAquisicao = new Date(y, m - 1, 1)

    const receitaMes1: number[] = []
    const receitaMes2: number[] = []
    const receitaMes3: number[] = []
    const receitaMes6: number[] = []
    const receitaMes12: number[] = []

    const start = mesAquisicao.getTime()
    const msPerMonth = 30 * 24 * 60 * 60 * 1000

    for (const clientId of data.clients) {
      const clientOrders = data.orders.get(clientId) ?? []
      const r1 = clientOrders.filter((o: { paidAt: Date; value: number }) => o.paidAt.getTime() >= start && o.paidAt.getTime() < start + 1 * msPerMonth).reduce((s: number, o: { value: number }) => s + o.value, 0)
      const r2 = clientOrders.filter((o: { paidAt: Date; value: number }) => o.paidAt.getTime() >= start + 1 * msPerMonth && o.paidAt.getTime() < start + 2 * msPerMonth).reduce((s: number, o: { value: number }) => s + o.value, 0)
      const r3 = clientOrders.filter((o: { paidAt: Date; value: number }) => o.paidAt.getTime() >= start + 2 * msPerMonth && o.paidAt.getTime() < start + 3 * msPerMonth).reduce((s: number, o: { value: number }) => s + o.value, 0)
      const r6 = clientOrders.filter((o: { paidAt: Date; value: number }) => o.paidAt.getTime() >= start + 5 * msPerMonth && o.paidAt.getTime() < start + 6 * msPerMonth).reduce((s: number, o: { value: number }) => s + o.value, 0)
      const r12 = clientOrders.filter((o: { paidAt: Date; value: number }) => o.paidAt.getTime() >= start + 11 * msPerMonth && o.paidAt.getTime() < start + 12 * msPerMonth).reduce((s: number, o: { value: number }) => s + o.value, 0)
      receitaMes1.push(r1)
      receitaMes2.push(r2)
      receitaMes3.push(r3)
      receitaMes6.push(r6)
      receitaMes12.push(r12)
    }

    const sumR1 = receitaMes1.reduce((a, b) => a + b, 0)
    const sumR2 = receitaMes2.reduce((a, b) => a + b, 0)
    const sumR3 = receitaMes3.reduce((a, b) => a + b, 0)
    const sumR6 = receitaMes6.reduce((a, b) => a + b, 0)
    const sumR12 = receitaMes12.reduce((a, b) => a + b, 0)

    const totalRevenue = sumR1 + sumR2 + sumR3 + sumR6 + sumR12
    const clientesAtivos = data.clients.length
    const retidos = receitaMes2.filter((r) => r > 0).length
    const retencaoPercentual = clientesAtivos > 0 ? (retidos / clientesAtivos) * 100 : 0
    const margemPercentual = totalRevenue > 0 ? 25 : 0 // placeholder; integrar custos quando houver

    await prisma.cohortMonthly.upsert({
      where: { mesAquisicao_referenceDate: { mesAquisicao, referenceDate: refDate } },
      create: {
        mesAquisicao,
        clientesAtivos,
        receitaMes1: new Decimal(sumR1),
        receitaMes2: new Decimal(sumR2),
        receitaMes3: new Decimal(sumR3),
        receitaMes6: new Decimal(sumR6),
        receitaMes12: new Decimal(sumR12),
        retencaoPercentual: new Decimal(retencaoPercentual),
        margemPercentual: new Decimal(margemPercentual),
        referenceDate: refDate,
      },
      update: {
        clientesAtivos,
        receitaMes1: new Decimal(sumR1),
        receitaMes2: new Decimal(sumR2),
        receitaMes3: new Decimal(sumR3),
        receitaMes6: new Decimal(sumR6),
        receitaMes12: new Decimal(sumR12),
        retencaoPercentual: new Decimal(retencaoPercentual),
        margemPercentual: new Decimal(margemPercentual),
      },
    })
    count++
  }
  return count
}
