import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'

/**
 * Notifica o produtor da conta (G2, se existir) e a gestão (admin / production manager).
 */
export async function notifyStakeholdersOnRmaOpen(rmaId: string): Promise<void> {
  const rma = await prisma.accountReplacementRequest.findUnique({
    where: { id: rmaId },
    include: {
      originalAccount: { select: { id: true, googleAdsCustomerId: true } },
      client: { include: { user: { select: { name: true } } } },
    },
  })
  if (!rma) return

  const g2 = await prisma.productionG2.findFirst({
    where: { stockAccountId: rma.originalAccountId, deletedAt: null },
    select: { creatorId: true, codeG2: true },
  })

  const cid = rma.originalAccount.googleAdsCustomerId || rma.originalAccountId.slice(0, 10)
  const clientName = rma.client.user?.name || 'Cliente'
  const title = 'Nova solicitação de reposição (RMA)'
  const message = `${clientName} — conta ${cid}${g2?.codeG2 ? ` (${g2.codeG2})` : ''}`
  const link = `/dashboard/suporte/rma?highlight=${rmaId}`

  const recipientIds = new Set<string>()
  if (g2?.creatorId) recipientIds.add(g2.creatorId)

  const staff = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'PRODUCTION_MANAGER', 'PRODUCER'] } },
    select: { id: true },
  })
  staff.forEach((u) => recipientIds.add(u.id))

  for (const userId of recipientIds) {
    await notify({ userId, title, message, link, channels: ['IN_APP'] })
  }
}
