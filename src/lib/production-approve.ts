import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { notifyAdminsProductionAccountApproved } from '@/lib/notifications/admin-events'

export type ApproveProductionResult =
  | { ok: true; stockAccountId: string }
  | { ok: false; code: 'NOT_FOUND' | 'INVALID_STATUS' }

/** Aprova uma produção e cria o registro de estoque (mesma regra de `/api/producao/[id]/aprovar`). */
export async function approveProductionAccount(
  id: string,
  auditorUserId: string
): Promise<ApproveProductionResult> {
  const production = await prisma.productionAccount.findFirst({
    where: { id, deletedAt: null },
    include: { producer: { select: { name: true } } },
  })
  if (!production) return { ok: false, code: 'NOT_FOUND' }
  if (!['PENDING', 'UNDER_REVIEW'].includes(production.status)) {
    return { ok: false, code: 'INVALID_STATUS' }
  }

  const stock = await prisma.$transaction(async (tx) => {
    const s = await tx.stockAccount.create({
      data: {
        platform: production.platform,
        type: production.type,
        source: 'PRODUCTION',
        status: 'AVAILABLE',
        purchasePrice: null,
        salePrice: null,
      },
    })
    await tx.productionAccount.update({
      where: { id },
      data: { status: 'APPROVED', stockAccountId: s.id },
    })
    return s
  })

  await audit({
    userId: auditorUserId,
    action: 'production_approved',
    entity: 'ProductionAccount',
    entityId: id,
    details: { stockAccountId: stock.id },
  })

  notifyAdminsProductionAccountApproved(production.platform).catch(console.error)

  return { ok: true, stockAccountId: stock.id }
}
