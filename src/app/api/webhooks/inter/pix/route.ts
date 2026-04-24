/**
 * POST /api/webhooks/inter/pix
 *
 * Webhook de confirmação de PIX recebido pelo Banco Inter.
 * Processa dois fluxos em paralelo:
 *   1. Order (sistema comercial legado)
 *   2. SalesCheckout (checkout PIX público — Ads Ativos)
 *
 * Ao confirmar pagamento do SalesCheckout:
 *   - Marca checkout como PAID + registra paidAt + e2eid
 *   - Marca Asset como SOLD + registra movimento no histórico
 *   - Envia conversão para Utmify (com UTMs do lead)
 *   - Dispara entrega automática via WhatsApp (Evolution API / Z-API)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runCommercialOrderPaidBridge } from '@/lib/commercial-order-bridge'
import { computeWarrantyEndsAt } from '@/lib/order-warranty'
import { syncClientLTV } from '@/lib/client-ltv'
import { notifyAdminsQuickSaleApproved, notifyAdminsSaleCompleted } from '@/lib/notifications/admin-events'
import { sendUtmifyConversion } from '@/lib/utmify'

export const runtime = 'nodejs'

// ─── Utilitário: extrai todos os txids do payload ────────────────────────────

function collectTxids(obj: unknown, out: Set<string>) {
  if (obj == null) return
  if (typeof obj === 'string' && /[a-z0-9-]{10,}/i.test(obj)) {
    const s = obj.trim()
    if (s.length >= 10 && s.length <= 120) out.add(s)
  }
  if (Array.isArray(obj)) {
    for (const x of obj) collectTxids(x, out)
    return
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (/txid|endToEnd|e2e/i.test(k) && typeof v === 'string') out.add(v.trim())
      collectTxids(v, out)
    }
  }
}

// ─── Entrega WhatsApp (Evolution API ou Z-API) ────────────────────────────────

async function sendWhatsAppDelivery(params: {
  whatsapp:    string   // E.164
  buyerName:   string
  adsId:       string
  displayName: string
  checkoutId:  string
}): Promise<void> {
  const evolutionUrl    = process.env.EVOLUTION_API_URL
  const evolutionApiKey = process.env.EVOLUTION_API_KEY
  const evolutionInst   = process.env.EVOLUTION_INSTANCE ?? 'adsativos'

  if (!evolutionUrl || !evolutionApiKey) {
    console.warn('[WhatsApp] EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurados — pulando entrega')
    return
  }

  const number = params.whatsapp.replace(/\D/g, '')
  const message = [
    `✅ *PAGAMENTO CONFIRMADO — ADS ATIVOS*`,
    ``,
    `Olá *${params.buyerName}*! Seu PIX foi recebido com sucesso.`,
    ``,
    `🛡️ *Conta adquirida:*`,
    `⚡ ID: \`${params.adsId}\``,
    `📦 ${params.displayName}`,
    ``,
    `🔐 O acesso será entregue em instantes pelo nosso suporte.`,
    `ID da compra: \`${params.checkoutId}\``,
    ``,
    `👉 Qualquer dúvida, responda esta mensagem.`,
  ].join('\n')

  await fetch(`${evolutionUrl}/message/sendText/${evolutionInst}`, {
    method:  'POST',
    headers: { apikey: evolutionApiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      number,
      options: { delay: 1000, presence: 'composing' },
      textMessage: { text: message },
    }),
  }).catch((e) => console.error('[WhatsApp] Erro ao enviar mensagem:', e))
}

// ─── Handler principal ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Validação de segurança opcional via secret header
  const secret = process.env.INTER_PIX_WEBHOOK_SECRET?.trim()
  if (secret && req.headers.get('x-inter-webhook-secret') !== secret) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let payload: unknown
  try { payload = await req.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const txids = new Set<string>()
  collectTxids(payload, txids)

  // Extrai e2eid do payload (campo endToEndId / e2eid do Inter)
  const pixArr = (payload as Record<string, unknown>)?.pix
  const e2eid = (Array.isArray(pixArr) ? (pixArr[0] as Record<string, unknown>)?.endToEndId : undefined) as string | undefined

  let ordersUpdated   = 0
  let checkoutsUpdated = 0

  for (const txid of txids) {
    // ── 1. Fluxo legado: Order comercial ────────────────────────────────────
    const order = await prisma.order.findFirst({
      where: { interPixTxid: txid },
      select: { id: true, status: true, warrantyHours: true },
    })
    if (order && order.status !== 'PAID' && order.status !== 'DELIVERED') {
      const paidAt = new Date()
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status:         'PAID',
          paidAt,
          warrantyEndsAt: computeWarrantyEndsAt(paidAt, order.warrantyHours ?? 48),
        },
      })
      ordersUpdated++

      const fullOrder = await prisma.order.findUnique({
        where:   { id: order.id },
        include: {
          items:  { include: { account: true } },
          client: { include: { user: { select: { name: true } } } },
        },
      })
      if (fullOrder?.clientId) {
        syncClientLTV(fullOrder.clientId).catch((e) => console.error('syncClientLTV', e))
      }
      if (fullOrder) {
        const items     = fullOrder.items || []
        const platforms = items.map((i) => i.account?.platform).filter(Boolean) as string[]
        notifyAdminsSaleCompleted(order.id, fullOrder.client?.user?.name ?? null, items.length, platforms)
          .catch((e) => console.error('notifyAdmins', e))
      }
      runCommercialOrderPaidBridge(order.id, 'webhook_inter')
        .catch((e) => console.error('commercialBridge', e))
    }

    // ── 2. Fluxo novo: SalesCheckout PIX ────────────────────────────────────
    const checkout = await prisma.salesCheckout.findUnique({
      where:   { interTxid: txid },
      include: { lead: true },
    })

    if (checkout && checkout.status === 'PENDING') {
      const paidAt = new Date()

      // 2a. Atualiza checkout
      await prisma.salesCheckout.update({
        where: { id: checkout.id },
        data: {
          status:         'PAID',
          paidAt,
          interE2eId:     e2eid ?? null,
          webhookPayload: payload as never,
        },
      })
      checkoutsUpdated++

      // 2b. Marca Asset como SOLD
      if (checkout.assetId) {
        await prisma.asset.update({
          where: { id: checkout.assetId },
          data: {
            status:  'SOLD',
            soldAt:  paidAt,
          },
        }).catch((e) => console.error('[Checkout] Falha ao marcar ativo SOLD:', e))

        await prisma.assetMovement.create({
          data: {
            assetId:  checkout.assetId,
            toStatus: 'SOLD',
            reason:   `Venda via checkout PIX — Lead: ${checkout.lead.name} (${checkout.lead.cpf}) — Checkout: ${checkout.id}`,
          },
        }).catch((e) => console.error('[Checkout] Falha ao registrar movimento:', e))
      }

      // 2c. Utmify — envia conversão (fire-and-forget)
      if (!checkout.utmifySent) {
        const asset = checkout.assetId
          ? await prisma.asset.findUnique({ where: { id: checkout.assetId }, select: { displayName: true } })
          : null

        sendUtmifyConversion({
          checkoutId:  checkout.id,
          adsId:       checkout.adsId,
          displayName: asset?.displayName ?? checkout.adsId,
          amountBrl:   Number(checkout.amount),
          paidAt,
          createdAt:   checkout.createdAt,
          buyer: {
            name:     checkout.lead.name,
            email:    checkout.lead.email ?? '',
            whatsapp: checkout.lead.whatsapp,
            cpf:      checkout.lead.cpf,
          },
          utms: {
            utm_source:   checkout.lead.utmSource   ?? undefined,
            utm_medium:   checkout.lead.utmMedium   ?? undefined,
            utm_campaign: checkout.lead.utmCampaign ?? undefined,
            utm_content:  checkout.lead.utmContent  ?? undefined,
            utm_term:     checkout.lead.utmTerm     ?? undefined,
          },
        }).then(async (ok) => {
          if (ok) {
            await prisma.salesCheckout.update({
              where: { id: checkout.id },
              data:  { utmifySent: true },
            })
          }
        }).catch((e) => console.error('[Utmify]', e))
      }

      // 2d. Entrega WhatsApp automática (fire-and-forget)
      if (!checkout.deliverySent) {
        const assetData = checkout.assetId
          ? await prisma.asset.findUnique({ where: { id: checkout.assetId }, select: { displayName: true } })
          : null

        sendWhatsAppDelivery({
          whatsapp:    checkout.lead.whatsapp,
          buyerName:   checkout.lead.name,
          adsId:       checkout.adsId,
          displayName: assetData?.displayName ?? checkout.adsId,
          checkoutId:  checkout.id,
        }).then(async () => {
          await prisma.salesCheckout.update({
            where: { id: checkout.id },
            data:  { deliverySent: true },
          })
        }).catch((e) => console.error('[WhatsApp delivery]', e))
      }
    }

    // ── 3. Fluxo Venda Rápida: QuickSaleCheckout ─────────────────────────────
    const quickCheckout = await prisma.quickSaleCheckout.findUnique({
      where:   { interTxid: txid },
      include: { listing: { select: { title: true, assetCategory: true } } },
    })

    if (quickCheckout && quickCheckout.status === 'PENDING') {
      const paidAt = new Date()
      const assetIds = Array.isArray(quickCheckout.reservedAssetIds)
        ? (quickCheckout.reservedAssetIds as string[])
        : []

      // 3a. Atualiza checkout como PAID
      await prisma.quickSaleCheckout.update({
        where: { id: quickCheckout.id },
        data: {
          status:         'PAID',
          paidAt,
          interE2eId:     e2eid ?? null,
          webhookPayload: payload as never,
        },
      })
      checkoutsUpdated++

      // 3a.1. Lança receita no Financeiro (vendas do dia / ERP)
      await prisma.financialEntry.create({
        data: {
          type:          'INCOME',
          category:      'RECEITA_COMERCIAL',
          value:         Number(quickCheckout.totalAmount),
          currency:      'BRL',
          date:          paidAt,
          dueDate:       paidAt,
          paymentDate:   paidAt,
          entryStatus:   'PAID',
          paymentMethod: 'PIX',
          reconciled:    false,
          description:   `Venda Rápida: ${quickCheckout.listing.title} | Checkout: ${quickCheckout.id} | Cliente: ${quickCheckout.buyerName}`,
        },
      }).catch((e) => console.error('[QuickCheckout] Falha ao registrar receita financeira:', e))

      // 3b. Marca todos os ativos reservados como SOLD
      if (assetIds.length > 0) {
        await prisma.asset.updateMany({
          where: { id: { in: assetIds } },
          data:  { status: 'SOLD', soldAt: paidAt },
        }).catch((e) => console.error('[QuickCheckout] Falha ao marcar ativos SOLD:', e))

        // Registra movimento para cada ativo
        await prisma.assetMovement.createMany({
          data: assetIds.map((aid) => ({
            assetId:  aid,
            toStatus: 'SOLD' as const,
            reason:   `Venda Rápida — Comprador: ${quickCheckout.buyerName} | CPF: ${quickCheckout.buyerCpf} | Checkout: ${quickCheckout.id}`,
          })),
          skipDuplicates: true,
        }).catch((e) => console.error('[QuickCheckout] Falha ao registrar movimentos:', e))
      }

      // 3c. Utmify (fire-and-forget)
      if (!quickCheckout.utmifySent) {
        sendUtmifyConversion({
          checkoutId:  quickCheckout.id,
          adsId:       quickCheckout.id,
          displayName: quickCheckout.listing.title,
          amountBrl:   Number(quickCheckout.totalAmount),
          paidAt,
          createdAt:   quickCheckout.createdAt,
          buyer: {
            name:     quickCheckout.buyerName,
            email:    quickCheckout.buyerEmail ?? '',
            whatsapp: quickCheckout.buyerWhatsapp,
            cpf:      quickCheckout.buyerCpf,
          },
          utms: {
            utm_source:   quickCheckout.utmSource   ?? undefined,
            utm_medium:   quickCheckout.utmMedium   ?? undefined,
            utm_campaign: quickCheckout.utmCampaign ?? undefined,
          },
        }).then(async (ok) => {
          if (ok) {
            await prisma.quickSaleCheckout.update({
              where: { id: quickCheckout.id },
              data:  { utmifySent: true },
            })
          }
        }).catch((e) => console.error('[Utmify/Quick]', e))
      }

      notifyAdminsQuickSaleApproved({
        checkoutId:  quickCheckout.id,
        buyerName:   quickCheckout.buyerName,
        listingTitle: quickCheckout.listing.title,
        quantity:    quickCheckout.qty,
        totalAmount: Number(quickCheckout.totalAmount),
      }).catch((e) => console.error('[QuickCheckout] Falha ao notificar admins:', e))

      // 3d. WhatsApp — entrega automática multi-ativo (fire-and-forget)
      if (!quickCheckout.deliverySent) {
        const evolutionUrl    = process.env.EVOLUTION_API_URL
        const evolutionApiKey = process.env.EVOLUTION_API_KEY
        const evolutionInst   = process.env.EVOLUTION_INSTANCE ?? 'adsativos'

        if (evolutionUrl && evolutionApiKey) {
          const number = quickCheckout.buyerWhatsapp.replace(/\D/g, '')
          const assetSummary = assetIds.length > 1
            ? `${assetIds.length} ativos reservados para você`
            : `1 ativo reservado para você`

          const message = [
            `✅ *PAGAMENTO CONFIRMADO — ADS ATIVOS*`,
            ``,
            `Olá *${quickCheckout.buyerName}*! Seu PIX foi recebido com sucesso.`,
            ``,
            `🛡️ *Produto:* ${quickCheckout.listing.title}`,
            `📦 *Quantidade:* ${quickCheckout.qty} unidade(s)`,
            `💰 *Total pago:* R$ ${Number(quickCheckout.totalAmount).toFixed(2)}`,
            ``,
            `📬 ${assetSummary}. Nossa equipe entrará em contato em instantes com os acessos.`,
            ``,
            `🔑 *ID do pedido:* \`${quickCheckout.id}\``,
            ``,
            `👉 Qualquer dúvida, responda esta mensagem.`,
          ].join('\n')

          fetch(`${evolutionUrl}/message/sendText/${evolutionInst}`, {
            method:  'POST',
            headers: { apikey: evolutionApiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              number,
              options: { delay: 1000, presence: 'composing' },
              textMessage: { text: message },
            }),
          }).then(async () => {
            await prisma.quickSaleCheckout.update({
              where: { id: quickCheckout.id },
              data:  { deliverySent: true },
            })
          }).catch((e) => console.error('[WhatsApp/Quick]', e))
        }
      }
    }
  }

  return NextResponse.json({
    ok:                true,
    txidsFound:        txids.size,
    ordersMarkedPaid:  ordersUpdated,
    checkoutsPaid:     checkoutsUpdated,
  })
}
