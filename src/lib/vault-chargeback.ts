import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { assertBalancedJournal, dec } from '@/lib/vault-intelligence'
import { applyClientRiskAfterChargeback } from '@/lib/client-risk-profile'

export type RegisterChargebackInput = {
  orderId: string
  amount: Prisma.Decimal | number
  gatewayRef?: string | null
  notes?: string | null
  extraStockAccountIds?: string[]
  createdById: string
}

/**
 * Registra chargeback, marca contas comprometidas e lança razão (débito = crédito).
 */
export async function registerChargebackAndFlagAssets(input: RegisterChargebackInput) {
  const amount = dec(input.amount)
  if (amount.lte(0)) throw new Error('Valor do chargeback deve ser positivo')

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      clientId: true,
      items: { select: { accountId: true } },
    },
  })
  if (!order) throw new Error('Pedido não encontrado')

  const fromItems = order.items.map((i) => i.accountId)
  const extra = input.extraStockAccountIds ?? []
  const uniqueIds = [...new Set([...fromItems, ...extra])]

  const cb = await prisma.$transaction(async (tx) => {
    const cb = await tx.chargebackRecord.create({
      data: {
        orderId: input.orderId,
        amount,
        gatewayRef: input.gatewayRef ?? null,
        notes: input.notes ?? null,
        status: 'ASSETS_FLAGGED',
        affectedStockAccountIds: uniqueIds,
        createdById: input.createdById,
      },
    })

    if (uniqueIds.length > 0) {
      await tx.stockAccount.updateMany({
        where: { id: { in: uniqueIds } },
        data: {
          compromisedAt: new Date(),
          compromiseReason: 'CHARGEBACK',
          status: 'CRITICAL',
        },
      })
    }

    const lines = [
      { account: 'CHARGEBACK_LOSS', debit: amount, credit: dec(0) },
      { account: 'AR', debit: dec(0), credit: amount },
    ]
    assertBalancedJournal(lines)

    await tx.vaultLedgerJournal.create({
      data: {
        occurredAt: new Date(),
        memo: `Chargeback pedido ${input.orderId.slice(-8)}`,
        source: 'CHARGEBACK',
        sourceId: cb.id,
        createdById: input.createdById,
        lines: {
          create: lines.map((l) => ({
            account: l.account,
            debit: l.debit,
            credit: l.credit,
          })),
        },
      },
    })

    await tx.chargebackRecord.update({
      where: { id: cb.id },
      data: { status: 'CLOSED' },
    })

    return cb
  })

  await applyClientRiskAfterChargeback(order.clientId)
  return cb
}
