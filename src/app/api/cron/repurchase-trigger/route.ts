/**
 * POST /api/cron/repurchase-trigger
 *
 * Recompra Inteligente — WhatsApp pós-entrega com link pré-preenchido.
 * Dispara 72h após o pagamento ser confirmado (conta ativada e em uso).
 *
 * Estratégia: não é follow-up genérico — é uma oferta específica
 * do mesmo produto que o cliente já comprou, com link direto e urgência.
 *
 * Roda 1x/hora via Vercel Cron.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'
import { getPublicAppBaseUrl } from '@/lib/public-app-url'
import { createDeliveryMagicLink } from '@/lib/delivery-magic-link'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CRON_SECRET          = process.env.CRON_SECRET
const REPURCHASE_DELAY_HRS = 72   // 3 dias após pagamento
const BATCH_SIZE           = 30

function buildRepurchaseMessage(params: {
  buyerName:     string
  productTitle:  string
  checkoutUrl:   string
  reorderUrl:    string
  warrantyEndsAt: Date | null
}) {
  const inWarranty = params.warrantyEndsAt && params.warrantyEndsAt > new Date()
  return [
    `🚀 *Olá, ${params.buyerName}!*`,
    ``,
    `Como está a performance com o seu *${params.productTitle}*?`,
    ``,
    inWarranty
      ? `✅ Seu ativo está *dentro da garantia* até ${params.warrantyEndsAt!.toLocaleDateString('pt-BR')}.`
      : ``,
    ``,
    `💡 *Clientes que escalam com 2 ou mais ativos reportam ROAS 2-3x maior* — porque distribuem o risco e nunca ficam parados por conta.`,
    ``,
    `👉 Estoque disponível agora — mesmo produto, prioridade de fila:`,
    params.reorderUrl,
    ``,
    `📦 Seu painel de pedidos: ${params.checkoutUrl}`,
    ``,
    `_Ads Ativos — Infraestrutura de escala para tráfego direto._`,
  ].filter((l) => l !== '').join('\n')
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now     = new Date()
  const cutoff  = new Date(now.getTime() - REPURCHASE_DELAY_HRS * 3_600_000)
  const appBase = getPublicAppBaseUrl() ?? process.env.NEXTAUTH_URL ?? ''

  // Checkouts PAID há mais de 72h, entregues (DELIVERED), sem repurchase enviado
  const eligible = await prisma.quickSaleCheckout.findMany({
    where: {
      status:  'PAID',
      paidAt:  { lte: cutoff },
      deliveryFlowStatus: { in: ['DELIVERED', 'WAITING_CUSTOMER_DATA'] },
      repurchaseMsgSentAt: null,
    },
    select: {
      id:              true,
      buyerName:       true,
      buyerWhatsapp:   true,
      warrantyEndsAt:  true,
      listing: {
        select: {
          slug:  true,
          title: true,
          active: true,
        },
      },
    },
    take: BATCH_SIZE,
  })

  let sent = 0, errors = 0

  for (const co of eligible) {
    // Só faz sentido se o listing ainda está ativo
    if (!co.listing.active) continue

    try {
      const checkoutUrl = `${appBase}/loja/${co.listing.slug}?checkoutId=${encodeURIComponent(co.id)}`

      // Gera magic link de recompra para o mesmo produto
      let reorderUrl = `${appBase}/pay/one/new?slug=${co.listing.slug}`
      try {
        const link = await createDeliveryMagicLink({
          checkoutId:  co.id,
          expiryHours: 48,
        }).catch(() => null)
        if (link) reorderUrl = link.url
      } catch { /* fallback para link direto */ }

      const ok = await sendWhatsApp({
        phone:   co.buyerWhatsapp,
        message: buildRepurchaseMessage({
          buyerName:     co.buyerName,
          productTitle:  co.listing.title,
          checkoutUrl,
          reorderUrl,
          warrantyEndsAt: co.warrantyEndsAt,
        }),
      })

      if (ok) {
        await prisma.quickSaleCheckout.update({
          where: { id: co.id },
          data:  { repurchaseMsgSentAt: now },
        })
        sent++
      }
    } catch (e) {
      console.error('[repurchase-trigger]', co.id, e)
      errors++
    }
  }

  console.log(`[repurchase-trigger] processed=${eligible.length} sent=${sent} errors=${errors}`)
  return NextResponse.json({ ok: true, processed: eligible.length, sent, errors, ranAt: now.toISOString() })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
