/**
 * Sincroniza quantityDelivered do grupo com contas G2 já entregues ao cliente (StockAccount.deliveredAt).
 */
import { prisma } from '@/lib/prisma'
import { computeDeliveryStatus } from '@/lib/delivery-group-utils'

export async function countDeliveredForDeliveryGroup(deliveryGroupId: string): Promise<number> {
  return prisma.productionG2.count({
    where: {
      deliveryGroupId,
      deletedAt: null,
      stockAccount: {
        deliveredAt: { not: null },
      },
    },
  })
}

export async function syncDeliveryGroupQuantityFromAccounts(deliveryGroupId: string): Promise<{
  quantityDelivered: number
  quantityContracted: number
  status: string
}> {
  const group = await prisma.deliveryGroup.findUnique({
    where: { id: deliveryGroupId },
    include: {
      repositions: { where: { status: { in: ['SOLICITADA', 'APROVADA'] } } },
    },
  })
  if (!group) throw new Error('Grupo não encontrado')

  const delivered = await countDeliveredForDeliveryGroup(deliveryGroupId)
  const capped = Math.min(delivered, group.quantityContracted)
  const hasActiveReposition = group.repositions.length > 0
  const autoStatus = computeDeliveryStatus(
    group.quantityContracted,
    capped,
    group.expectedCompletionAt,
    hasActiveReposition,
  )

  const updated = await prisma.deliveryGroup.update({
    where: { id: deliveryGroupId },
    data: {
      quantityDelivered: capped,
      lastUpdatedAt: new Date(),
      status: autoStatus,
      ...(autoStatus === 'FINALIZADA' ? { completedAt: new Date() } : {}),
    },
  })

  return {
    quantityDelivered: updated.quantityDelivered,
    quantityContracted: updated.quantityContracted,
    status: updated.status,
  }
}
