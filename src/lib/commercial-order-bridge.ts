import { prisma } from './prisma'
import { notifyCommercialOxygenHandoff } from '@/lib/notifications/admin-events'
import { sendTelegramSalesMessage } from '@/lib/telegram-sales'

/**
 * Bridge “Pulmão”: pedido pago → solicitação de contas (se faltar estoque alocado) + notifica produção / P&amp;P / entregas + Telegram.
 * Idempotente via `commercialBridgeAt`. Somente `status === PAID`.
 */
export async function runCommercialOrderPaidBridge(
  orderId: string,
  source: 'webhook_inter' | 'webhook_asaas' | 'pedidos_patch' | 'manual_confirm'
): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      client: { include: { user: { select: { name: true, email: true, phone: true } } } },
      seller: { select: { name: true, email: true } },
    },
  })

  if (!order) return { ok: false, reason: 'Pedido não encontrado' }
  if (order.status !== 'PAID') {
    return { ok: false, reason: 'Bridge só para pedidos em status PAID' }
  }
  if (order.commercialBridgeAt) {
    return { ok: true, skipped: true, reason: 'Bridge já executado' }
  }

  const shortfall = Math.max(0, order.quantity - order.items.length)

  await prisma.$transaction(async (tx) => {
    if (shortfall > 0) {
      const exists = await tx.accountSolicitation.findFirst({
        where: { referenceOrderId: orderId },
      })
      if (!exists) {
        await tx.accountSolicitation.create({
          data: {
            clientId: order.clientId,
            quantity: shortfall,
            product: order.product,
            accountType: order.accountType,
            country: order.country,
            referenceOrderId: orderId,
            status: 'pending',
            notes: `Auto (Oxygen): pedido ${orderId} pago — ${shortfall} conta(s) a produzir/entregar. Origem: ${source}`,
          },
        })
      }
    }

    await tx.order.update({
      where: { id: orderId },
      data: { commercialBridgeAt: new Date() },
    })
  })

  const clientName = order.client?.user?.name || order.client?.user?.email || 'Cliente'
  const valueStr = Number(order.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  await notifyCommercialOxygenHandoff({
    orderId,
    clientName,
    quantity: order.quantity,
    product: order.product,
    accountType: order.accountType,
    sellerName: order.seller?.name ?? null,
    shortfall,
    source,
  })

  const producerLabel = process.env.COMMERCIAL_TELEGRAM_PRODUCER_LABEL?.trim() || 'Francielle (produção)'
  const techLabel = process.env.COMMERCIAL_TELEGRAM_TECH_LABEL?.trim() || 'Gustavo (técnico / P&P)'
  const tg = `💰 <b>PIX CONFIRMADO!</b>\nCliente: ${escapeHtml(clientName)}\nValor: ${escapeHtml(valueStr)}\nStatus: Pedido enviado para produção de ${escapeHtml(producerLabel)} e ${escapeHtml(techLabel)}.\nPedido: <code>${escapeHtml(orderId)}</code>\nOrigem: ${escapeHtml(source)}`
  await sendTelegramSalesMessage(tg).catch((e) => console.error('telegram sales', e))

  return { ok: true }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
