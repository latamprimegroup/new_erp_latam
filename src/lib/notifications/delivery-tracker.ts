/**
 * Notificações quando o progresso de entrega Plug & Play muda (comercial + cliente).
 */
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'
import { sendPush } from '@/lib/notifications/channels/push'

export async function notifyDeliveryGroupProgress(
  deliveryGroupId: string,
  previousDelivered: number,
  newDelivered: number,
): Promise<void> {
  if (newDelivered <= previousDelivered) return

  const group = await prisma.deliveryGroup.findUnique({
    where: { id: deliveryGroupId },
    include: {
      client: { select: { clientCode: true, userId: true } },
      order: { select: { sellerId: true } },
    },
  })
  if (!group) return

  const label = group.client.clientCode
    ? `Cliente ${group.client.clientCode}`
    : 'Cliente'
  const title = 'Entrega atualizada'
  const message = `${label} — ${newDelivered}/${group.quantityContracted} contas entregues (grupo ${group.groupNumber}).`

  await notify({
    userId: group.client.userId,
    title,
    message,
    link: '/dashboard/cliente',
    channels: ['IN_APP'],
  })
  await sendPush({
    userId: group.client.userId,
    title: '📦 ' + title,
    body: message,
    link: '/dashboard/cliente',
    tag: `delivery-${deliveryGroupId}`,
  })

  if (group.order?.sellerId) {
    await notify({
      userId: group.order.sellerId,
      title: 'Progresso de entrega (Plug & Play)',
      message,
      link: '/dashboard/logistica/plugplay-tracker',
      channels: ['IN_APP'],
    })
    await sendPush({
      userId: group.order.sellerId,
      title: '📦 Entrega Plug & Play',
      body: message,
      link: '/dashboard/logistica/plugplay-tracker',
      tag: `delivery-seller-${deliveryGroupId}`,
    })
  }

  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true },
  })
  for (const a of admins) {
    await notify({
      userId: a.id,
      title: 'Entrega Plug & Play',
      message,
      link: '/dashboard/logistica/plugplay-tracker',
      channels: ['IN_APP'],
    })
  }
}
