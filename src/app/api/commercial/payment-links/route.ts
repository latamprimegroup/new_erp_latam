import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPublicAppBaseUrl } from '@/lib/public-app-url'
import {
  isBlockedForPlugPlay,
  isG2PremiumLabel,
  isHighRiskScore,
  recalculateCustomerScore,
} from '@/lib/reputation-engine'

const schema = z.object({
  orderId: z.string().min(1),
})

/**
 * Gera instruções + rascunho de link de pagamento (PIX existente no pedido ou placeholders Asaas/MP/Stripe).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL', 'FINANCE'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const { orderId } = schema.parse(await req.json())
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { client: { include: { user: { select: { name: true, email: true } } } } },
    })
    if (!order) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
    const reputation = await recalculateCustomerScore(order.clientId).catch(() => null)
    const isPremiumG2 = isG2PremiumLabel(order.accountType, order.product)
    const blocked =
      isPremiumG2 &&
      reputation &&
      (isHighRiskScore(reputation.score) || isBlockedForPlugPlay(reputation.plugPlayErrorCount))
    if (blocked) {
      return NextResponse.json(
        {
          error:
            'Bloqueado para G2 Premium: cliente com Score High Risk ou 3 substituições seguidas em Plug & Play.',
          reputation,
        },
        { status: 403 }
      )
    }

    const base = getPublicAppBaseUrl()
    const valueStr = Number(order.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const asaasBase = process.env.ASAAS_PAYMENT_LINK_BASE?.trim()
    const mpPreference = process.env.MERCADOPAGO_CHECKOUT_BASE?.trim()
    const stripeBase = process.env.STRIPE_PAYMENT_LINK_BASE?.trim()

    const whatsappMsg = [
      `Olá, ${order.client.user.name || 'tudo bem'}!`,
      `Segue pagamento do pedido #${orderId.slice(-8)} — ${order.product} (${order.accountType}) ×${order.quantity}.`,
      `Valor: ${valueStr}.`,
      order.interPixCopiaECola ? `PIX copia e cola:\n${order.interPixCopiaECola}` : '',
      asaasBase ? `Link Asaas: ${asaasBase}?order=${orderId}` : '',
      base ? `Área do cliente: ${base}/dashboard/cliente/compras` : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    return NextResponse.json({
      orderId,
      value: Number(order.value),
      currency: order.currency,
      pixCopiaECola: order.interPixCopiaECola,
      pixTxid: order.interPixTxid,
      links: {
        asaas: asaasBase ? `${asaasBase}?externalReference=${encodeURIComponent(orderId)}` : null,
        mercadoPago: mpPreference ? `${mpPreference}?external_reference=${encodeURIComponent(orderId)}` : null,
        stripe: stripeBase ? `${stripeBase}?client_reference_id=${encodeURIComponent(orderId)}` : null,
      },
      whatsappMessageDraft: whatsappMsg,
      reputation,
      note:
        'Configure ASAAS_PAYMENT_LINK_BASE, MERCADOPAGO_CHECKOUT_BASE ou STRIPE_PAYMENT_LINK_BASE no ambiente para URLs reais. Webhook Asaas: /api/webhooks/asaas/payment com externalReference = id do pedido.',
    })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    throw e
  }
}
