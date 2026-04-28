/**
 * PATCH /api/admin/vendas-aprovadas/[id]
 * Atualiza e-mail AdsPower, status de entrega e envia WhatsApp de confirmação.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'
import { getPublicAppBaseUrl } from '@/lib/public-app-url'
import { z } from 'zod'

const schema = z.object({
  adspowerEmail:         z.string().email().optional(),
  adspowerProfileReleased: z.boolean().optional(),
  deliveryFlowStatus:    z.enum([
    'WAITING_CUSTOMER_DATA', 'DELIVERY_REQUESTED',
    'DELIVERY_IN_PROGRESS', 'DELIVERED',
  ]).optional(),
  deliveryStatusNote:    z.string().max(300).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRoles(['ADMIN', 'CEO', 'DELIVERER'])
  if (!auth.ok) return auth.response

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos.', details: parsed.error.flatten() }, { status: 422 })
  }

  const order = await prisma.quickSaleCheckout.findUnique({
    where: { id: params.id },
    select: {
      id: true, status: true, buyerName: true, buyerWhatsapp: true,
      listing: { select: { title: true, slug: true } },
    },
  })
  if (!order || order.status !== 'PAID') {
    return NextResponse.json({ error: 'Pedido não encontrado ou não está pago.' }, { status: 404 })
  }

  const data = parsed.data
  const updateData: Record<string, unknown> = {}

  if (data.adspowerEmail)           updateData.adspowerEmail = data.adspowerEmail
  if (data.adspowerProfileReleased !== undefined) updateData.adspowerProfileReleased = data.adspowerProfileReleased
  if (data.deliveryFlowStatus)      updateData.deliveryFlowStatus = data.deliveryFlowStatus
  if (data.deliveryStatusNote)      updateData.deliveryStatusNote = data.deliveryStatusNote

  // Status automático quando recebe e-mail AdsPower
  if (data.adspowerEmail && !data.deliveryFlowStatus) {
    updateData.deliveryFlowStatus  = 'DELIVERY_REQUESTED'
    updateData.deliveryStatusNote  = 'Dados AdsPower recebidos — entrega em fila.'
    updateData.deliveryRequestedAt = new Date()
    updateData.adspowerProfileReleased = true
  }

  if (data.deliveryFlowStatus === 'DELIVERED') {
    updateData.deliverySent = true
    updateData.deliveryStatusNote = data.deliveryStatusNote || 'Ativo entregue com sucesso.'
  }

  await prisma.quickSaleCheckout.update({
    where: { id: params.id },
    data: updateData,
  })

  // WhatsApp automático de atualização de status
  if (data.deliveryFlowStatus === 'DELIVERED') {
    const appBase = getPublicAppBaseUrl() || 'https://www.adsativos.com'
    const msg = [
      `🎉 *Seu ativo foi entregue! — Ads Ativos*`,
      ``,
      `Produto: *${order.listing.title}*`,
      ``,
      `Acesse o painel para ver os detalhes da entrega:`,
      `${appBase}/loja/${order.listing.slug}?checkoutId=${order.id}`,
      ``,
      `Qualquer dúvida, responda esta mensagem.`,
      `_Ads Ativos — War Room OS_`,
    ].join('\n')
    sendWhatsApp({ phone: order.buyerWhatsapp, message: msg })
      .catch((e) => console.error('[VendasAprovadas] WhatsApp DELIVERED falhou:', e))
  }

  await prisma.auditLog.create({
    data: {
      action:   'VENDAS_APROVADAS_UPDATED',
      entity:   'QuickSaleCheckout',
      entityId: params.id,
      userId:   auth.session.user.id,
      details:  { ...data, operator: auth.session.user.name ?? auth.session.user.id },
    },
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
