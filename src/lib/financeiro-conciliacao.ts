/**
 * Conciliação: pedidos pagos (gateways) vs lançamentos de receita no razão interno.
 */
import { prisma } from '@/lib/prisma'
import { monthRange, VAULT_PAID_STATUSES } from '@/lib/vault-intelligence'

export async function gatewayReconciliationSnapshot(year: number, month: number) {
  const { start, end } = monthRange(year, month)

  const orders = await prisma.order.findMany({
    where: {
      status: { in: [...VAULT_PAID_STATUSES] },
      paidAt: { gte: start, lte: end },
    },
    select: {
      id: true,
      value: true,
      paidAt: true,
      status: true,
      interPixTxid: true,
      financialEntries: {
        where: { type: 'INCOME' },
        select: { id: true, value: true, reconciled: true, date: true, description: true },
      },
    },
    orderBy: { paidAt: 'desc' },
  })

  let withIncome = 0
  let withoutIncome = 0
  let amountAligned = 0

  const rows = orders.map((o) => {
    const incomes = o.financialEntries
    const sumIncome = incomes.reduce((s, e) => s + Number(e.value), 0)
    const val = Number(o.value)
    const matched = incomes.length > 0 && Math.abs(sumIncome - val) < 0.02
    if (incomes.length > 0) withIncome += 1
    else withoutIncome += 1
    if (matched) amountAligned += 1

    let gateway = '—'
    if (o.interPixTxid) gateway = 'PIX_Banco_Inter'
    else gateway = 'Outro/Asaas/Stripe'

    return {
      orderId: o.id,
      paidAt: o.paidAt?.toISOString() ?? null,
      orderValue: val,
      status: o.status,
      gatewayHint: gateway,
      incomeEntryCount: incomes.length,
      incomeReconciledAll: incomes.length > 0 && incomes.every((i) => i.reconciled),
      matchedAmount: matched,
      entries: incomes.map((i) => ({
        id: i.id,
        value: Number(i.value),
        reconciled: i.reconciled,
        date: i.date.toISOString(),
      })),
    }
  })

  return {
    summary: {
      ordersPaidInPeriod: orders.length,
      ordersWithIncomeEntry: withIncome,
      ordersWithoutIncomeEntry: withoutIncome,
      ordersWithAlignedAmount: amountAligned,
    },
    rows,
  }
}
