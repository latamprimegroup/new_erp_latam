/**
 * Análise de coorte por mês de aquisição
 */
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'

export async function computeCohortMetrics(): Promise<void> {
  const refDate = new Date()
  refDate.setHours(0, 0, 0, 0)

  const clients = await prisma.clientProfile.findMany({
    include: {
      orders: {
        where: { status: { in: ['PAID', 'DELIVERED'] }, paidAt: { not: null } },
        select: { value: true, paidAt: true },
      },
    },
  })

  const cohortMap = new Map<string, { clients: string[]; revenue: number }>()
  for (const c of clients) {
    const firstOrder = c.orders
      .map((o) => o.paidAt)
      .filter((d): d is Date => d != null)
      .sort((a, b) => a.getTime() - b.getTime())[0]
    if (!firstOrder) continue

    const cohortMonth = new Date(firstOrder.getFullYear(), firstOrder.getMonth(), 1)
    const key = cohortMonth.toISOString().slice(0, 7)
    const revenue = c.orders.reduce((s, o) => s + Number(o.value), 0)
    const existing = cohortMap.get(key) ?? { clients: [], revenue: 0 }
    existing.clients.push(c.id)
    existing.revenue += revenue
    cohortMap.set(key, existing)
  }

  const now = new Date()
  const retentionCutoff = new Date(now)
  retentionCutoff.setMonth(retentionCutoff.getMonth() - 1)

  for (const [cohortKey, data] of Array.from(cohortMap.entries())) {
    const [y, m] = cohortKey.split('-').map(Number)
    const cohortMonth = new Date(y, m - 1, 1)
    const marginTotal = data.revenue * 0.25
    const retentionPct = 70

    await prisma.cohortMetric.upsert({
      where: {
        cohortMonth_referenceDate: { cohortMonth, referenceDate: refDate },
      },
      create: {
        cohortMonth,
        clientsCount: data.clients.length,
        revenueTotal: new Decimal(data.revenue),
        marginTotal: new Decimal(marginTotal),
        retentionPct: new Decimal(retentionPct),
        referenceDate: refDate,
      },
      update: {
        clientsCount: data.clients.length,
        revenueTotal: new Decimal(data.revenue),
        marginTotal: new Decimal(marginTotal),
        retentionPct: new Decimal(retentionPct),
      },
    })
  }
}
