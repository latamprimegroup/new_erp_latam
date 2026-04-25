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
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { runCommercialOrderPaidBridge } from '@/lib/commercial-order-bridge'
import { handleSaleToFinancialBridge } from '@/lib/commercial-financial-bridge'
import { computeWarrantyEndsAt } from '@/lib/order-warranty'
import { syncClientLTV } from '@/lib/client-ltv'
import {
  notifyAdminsQuickSaleApproved,
  notifyAdminsSaleCompleted,
  notifyProductionManagerStockSold,
} from '@/lib/notifications/admin-events'
import { sendSaleIncentiveNotifications } from '@/lib/notifications/sales-incentive'
import { sendUtmifyConversion, sendUtmifyQuickSaleConversion } from '@/lib/utmify'
import {
  sendWhatsAppEliteDelivery,
  sendWhatsApp,
} from '@/lib/notifications/channels/whatsapp'
import { sendEmail, buildDeliveryEmail } from '@/lib/notifications/channels/email'
import {
  calculateQuickSaleIncentiveBreakdown,
  registerQuickSaleProductionBonus,
  getSalesCheckoutIncentiveBreakdown,
} from '@/lib/incentive-engine'
import {
  adspowerMoveProfile,
  evaluateQuickSaleRisk,
  getQuickSaleAdspowerProfileRef,
  resolveQuickSaleAdspowerGroupId,
  setQuickSaleKycMeta,
  sendFraudAlertToChatOps,
  type QuickSaleRiskReason,
} from '@/lib/smart-delivery-system'

export const runtime = 'nodejs'

const QUICK_DELIVERY_FLOW = {
  WAITING_CUSTOMER_DATA: 'WAITING_CUSTOMER_DATA',
  PENDING_KYC: 'PENDING_KYC',
  DELIVERY_REQUESTED: 'DELIVERY_REQUESTED',
  DELIVERY_IN_PROGRESS: 'DELIVERY_IN_PROGRESS',
  DELIVERED: 'DELIVERED',
} as const

function riskReasonLabel(reason: QuickSaleRiskReason) {
  if (reason === 'AMOUNT_ABOVE_KYC') return 'Valor acima do limite mínimo para KYC'
  if (reason === 'SUSPICIOUS_EMAIL_DOMAIN') return 'E-mail com domínio suspeito'
  if (reason === 'BLACKLISTED_IDENTITY') return 'Identidade em blacklist global'
  return reason
}

async function tryAutoMoveAdspowerProfile(params: {
  checkoutId: string
  listingId: string
}) {
  const ref = await getQuickSaleAdspowerProfileRef(params.checkoutId).catch(() => null)
  if (!ref?.profileId) {
    return { moved: false as const, reason: 'NO_PROFILE_REF' as const }
  }
  const targetGroupId = ref.groupId || await resolveQuickSaleAdspowerGroupId(params.listingId)
  if (!targetGroupId) {
    return { moved: false as const, reason: 'NO_GROUP_MAP' as const, profileId: ref.profileId }
  }
  await adspowerMoveProfile({
    profileId: ref.profileId,
    targetGroupId,
  })
  return {
    moved: true as const,
    profileId: ref.profileId,
    targetGroupId,
  }
}

// ─── Log de auditoria de cada evento PIX ─────────────────────────────────────

async function logPixEvent(data: {
  txid:       string
  e2eid?:     string
  amount?:    number
  status:     'PROCESSED' | 'DUPLICATE' | 'NOT_FOUND' | 'ERROR'
  flowType?:  string
  relatedId?: string
  rawPayload?: string
  errorMsg?:  string
}) {
  await prisma.interPixLog.create({
    data: {
      txid:       data.txid,
      e2eid:      data.e2eid ?? null,
      amount:     data.amount ?? null,
      status:     data.status,
      flowType:   data.flowType ?? null,
      relatedId:  data.relatedId ?? null,
      rawPayload: data.rawPayload ? data.rawPayload.slice(0, 2000) : null,
      errorMsg:   data.errorMsg  ?? null,
      processedAt: new Date(),
    },
  }).catch((e) => console.error('[InterPixLog] Falha ao gravar log:', e))
}

// ─── Auto-criação de conta de cliente ────────────────────────────────────────

/**
 * Garante que o comprador tem uma conta CLIENT no sistema.
 * Se não existir, cria User + ClientProfile e retorna a senha temporária gerada.
 * Retorna null se o e-mail não for informado ou a conta já existir.
 */
async function ensureClientAccount(params: {
  name:      string
  email:     string | null
  whatsapp:  string
}): Promise<{ isNew: boolean; tempPassword?: string; userId: string } | null> {
  if (!params.email) return null

  const emailNorm = params.email.trim().toLowerCase()

  const existing = await prisma.user.findUnique({
    where:  { email: emailNorm },
    select: { id: true },
  })

  if (existing) return { isNew: false, userId: existing.id }

  const tempPassword = Math.random().toString(36).slice(2, 10).toUpperCase()
  const passwordHash = await hash(tempPassword, 10)

  const newUser = await prisma.user.create({
    data: {
      email:        emailNorm,
      name:         params.name,
      phone:        params.whatsapp,
      role:         'CLIENT',
      status:       'ACTIVE',
      passwordHash,
      emailVerified: new Date(),
      clientProfile: {
        create: {
          whatsapp:       params.whatsapp,
          notifyEmail:    true,
          notifyWhatsapp: true,
        },
      },
    },
    select: { id: true },
  })

  return { isNew: true, tempPassword, userId: newUser.id }
}

// ─── Parser do payload Inter PIX ─────────────────────────────────────────────
//
// Payload oficial do webhook (GET /pix/v2 — docs Inter):
// {
//   "pix": [{
//     "endToEndId": "E60746948202212091600ccafd993ea7",
//     "txid":       "7978c0c97ea847e78e8849634473c1f1",
//     "valor":      "110.00",
//     "horario":    "2021-09-01T20:00:00.00Z",
//     "infoPagador": "0123456789"
//   }]
// }

type InterPixItem = {
  txid?:        string
  endToEndId?:  string
  valor?:       string
  horario?:     string
  infoPagador?: string
}

type InterWebhookPayload = {
  pix?: InterPixItem[]
}

/**
 * Extrai lista de itens PIX do payload do webhook Inter.
 * Prioriza o campo `pix[]` oficial; usa fallback recursivo para formatos
 * não padronizados de parceiros/sandbox.
 */
function extractPixItems(raw: unknown): InterPixItem[] {
  const typed = raw as InterWebhookPayload | null
  if (typed?.pix && Array.isArray(typed.pix) && typed.pix.length > 0) {
    return typed.pix.filter((p) => typeof p.txid === 'string' && p.txid.length >= 10)
  }

  // Fallback: busca recursiva por objetos com campo txid
  const items: InterPixItem[] = []
  function scan(obj: unknown) {
    if (obj == null || typeof obj !== 'object') return
    if (Array.isArray(obj)) { obj.forEach(scan); return }
    const o = obj as Record<string, unknown>
    if (typeof o.txid === 'string' && o.txid.length >= 10) {
      items.push({ txid: o.txid, endToEndId: o.endToEndId as string, valor: o.valor as string })
    } else {
      Object.values(o).forEach(scan)
    }
  }
  scan(raw)
  return items
}

// ─── Handler principal ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Validação de segurança opcional via secret header
  const secret = process.env.INTER_PIX_WEBHOOK_SECRET?.trim()
  if (secret && req.headers.get('x-inter-webhook-secret') !== secret) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let payload: unknown
  let rawPayload = ''
  try {
    const text = await req.text()
    rawPayload  = text
    payload     = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const pixItems = extractPixItems(payload)

  if (pixItems.length === 0) {
    await logPixEvent({ txid: 'UNKNOWN', status: 'NOT_FOUND', rawPayload, errorMsg: 'Nenhum txid encontrado no payload' })
    // Retorna 200 para o Inter não reenviar — simplesmente não há cobrança correspondente
    return NextResponse.json({ ok: true, txidsFound: 0 })
  }

  let ordersUpdated    = 0
  let checkoutsUpdated = 0

  for (const item of pixItems) {
    const txid      = item.txid!
    const e2eid     = item.endToEndId
    const pixAmount = item.valor ? Number(item.valor) : undefined

    // ── 1. Fluxo legado: Order comercial ────────────────────────────────────
    const order = await prisma.order.findFirst({
      where: { interPixTxid: txid },
      select: { id: true, status: true, warrantyHours: true },
    })
    if (order && (order.status === 'PAID' || order.status === 'DELIVERED')) {
      await logPixEvent({ txid, e2eid, amount: pixAmount, status: 'DUPLICATE', flowType: 'ORDER', relatedId: order.id })
    }
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
      handleSaleToFinancialBridge(order.id, 'webhook_inter')
        .catch((e) => console.error('financialBridge', e))

      await logPixEvent({ txid, e2eid, amount: pixAmount, status: 'PROCESSED', flowType: 'ORDER', relatedId: order.id, rawPayload })
    }

    // ── 2. Fluxo novo: SalesCheckout PIX ────────────────────────────────────
    const checkout = await prisma.salesCheckout.findUnique({
      where:   { interTxid: txid },
      include: { lead: true },
    })

    if (checkout && checkout.status !== 'PENDING') {
      await logPixEvent({ txid, e2eid, amount: pixAmount, status: 'DUPLICATE', flowType: 'SALES_CHECKOUT', relatedId: checkout.id })
    }
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

      // 2c. Utmify — envia conversão
      const checkoutIncentive = await getSalesCheckoutIncentiveBreakdown(checkout.id)
      let checkoutUtmifySynced = Boolean(checkout.utmifySent)

      if (!checkout.utmifySent) {
        const asset = checkout.assetId
          ? await prisma.asset.findUnique({ where: { id: checkout.assetId }, select: { displayName: true } })
          : null

        const utmifyResult = await sendUtmifyConversion({
          checkoutId:  checkout.id,
          adsId:       checkout.adsId,
          displayName: asset?.displayName ?? checkout.adsId,
          amountBrl:   Number(checkout.amount),
          netProfitBrl: checkoutIncentive.netProfit,
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
        }).catch((e) => {
          console.error('[Utmify]', e)
          return { ok: false }
        })
        checkoutUtmifySynced = Boolean(utmifyResult.ok)

        if (checkoutUtmifySynced) {
          await prisma.salesCheckout.update({
            where: { id: checkout.id },
            data:  { utmifySent: true },
          }).catch((e) => console.error('[Utmify] Falha ao marcar sincronização:', e))
        }
      }

      // 2d. Entrega Elite WhatsApp com credenciais (fire-and-forget, anti-duplicata via deliverySent)
      if (!checkout.deliverySent) {
        const assetData = checkout.assetId
          ? await prisma.asset.findUnique({
              where:  { id: checkout.assetId },
              select: { displayName: true, rawData: true },
            })
          : null

        // Calcula prazo de garantia (7 dias padrão)
        const warrantyEndsAt = new Date(paidAt.getTime() + 7 * 24 * 60 * 60 * 1000)
        // Persiste prazo de garantia no checkout
        prisma.salesCheckout.update({
          where: { id: checkout.id },
          data:  { warrantyEndsAt },
        }).catch(() => {})

        const hasRawData = assetData?.rawData && typeof assetData.rawData === 'object'

        sendWhatsAppEliteDelivery({
          whatsapp:      checkout.lead.whatsapp,
          buyerName:     checkout.lead.name,
          productTitle:  assetData?.displayName ?? checkout.adsId,
          checkoutId:    checkout.id,
          credentials:   hasRawData ? (assetData!.rawData as Record<string, unknown>) : null,
          warrantyEndsAt,
        }).then(async (sent) => {
          if (sent) {
            await prisma.salesCheckout.update({
              where: { id: checkout.id },
              data:  { deliverySent: true },
            }).catch((e) => console.error('[WhatsApp] Falha ao persistir deliverySent:', e))
          }
        }).catch((e) => console.error('[WhatsApp delivery/SalesCheckout]', e))
      }

      if (checkoutIncentive.sellerId) {
        sendSaleIncentiveNotifications({
          sellerId: checkoutIncentive.sellerId,
          sellerName: checkoutIncentive.sellerName,
          publicId: checkout.adsId,
          grossValue: checkoutIncentive.grossValue,
          sellerCommission: checkoutIncentive.sellerCommission,
          managerCommission: checkoutIncentive.managerCommission,
          supplierCost: checkoutIncentive.supplierCost,
          netProfit: checkoutIncentive.netProfit,
          remainingToUnlock: checkoutIncentive.sellerRemainingToUnlock ?? 0,
          utmifySynced: checkoutUtmifySynced,
        }).catch((e) => console.error('[Checkout] Incentive notify', e))
      }

      if (checkoutIncentive.nicheForReplenishment) {
        notifyProductionManagerStockSold({
          assetId: checkout.adsId,
          niche: checkoutIncentive.nicheForReplenishment,
          listingTitle: checkoutIncentive.displayName || checkout.adsId,
        }).catch((e) => console.error('[Checkout] notify production manager', e))
      }

      await logPixEvent({ txid, e2eid, amount: Number(checkout.amount), status: 'PROCESSED', flowType: 'SALES_CHECKOUT', relatedId: checkout.id, rawPayload })
    }

    // ── 3. Fluxo Venda Rápida: QuickSaleCheckout ─────────────────────────────
    const quickCheckout = await prisma.quickSaleCheckout.findUnique({
      where:   { interTxid: txid },
      include: { listing: { select: { title: true, slug: true, assetCategory: true, warrantyDays: true, destinationProfile: true } } },
    })

    if (quickCheckout && quickCheckout.status !== 'PENDING') {
      await logPixEvent({ txid, e2eid, amount: pixAmount, status: 'DUPLICATE', flowType: 'QUICK_CHECKOUT', relatedId: quickCheckout.id })
    }
    if (quickCheckout && quickCheckout.status === 'PENDING') {
      const paidAt = new Date()
      const assetIds = Array.isArray(quickCheckout.reservedAssetIds)
        ? (quickCheckout.reservedAssetIds as string[])
        : []
      const warrantyDays = quickCheckout.listing.warrantyDays ?? 7
      const warrantyEndsAt = new Date(paidAt.getTime() + warrantyDays * 24 * 60 * 60 * 1000)
      const riskDecision = await evaluateQuickSaleRisk({
        totalAmountBrl: Number(quickCheckout.totalAmount),
        buyerEmail: quickCheckout.buyerEmail,
        buyerDocument: quickCheckout.buyerCpf,
      }).catch(() => ({
        requiresKyc: false,
        reasons: [] as QuickSaleRiskReason[],
        minValueForKyc: 300,
      }))
      if (riskDecision.requiresKyc) {
        await setQuickSaleKycMeta(quickCheckout.id, {
          riskReasons: riskDecision.reasons,
          minValueForKyc: riskDecision.minValueForKyc,
        }).catch((e) => console.error('[QuickCheckout] Falha ao salvar meta KYC:', e))
      }
      const paidFlowStatus =
        riskDecision.requiresKyc
          ? QUICK_DELIVERY_FLOW.PENDING_KYC
          : (
        quickCheckout.deliveryFlowStatus === QUICK_DELIVERY_FLOW.DELIVERED
          ? QUICK_DELIVERY_FLOW.DELIVERED
          : quickCheckout.deliveryFlowStatus === QUICK_DELIVERY_FLOW.DELIVERY_IN_PROGRESS
            ? QUICK_DELIVERY_FLOW.DELIVERY_IN_PROGRESS
            : quickCheckout.deliveryFlowStatus === QUICK_DELIVERY_FLOW.DELIVERY_REQUESTED
              ? QUICK_DELIVERY_FLOW.DELIVERY_REQUESTED
              : QUICK_DELIVERY_FLOW.WAITING_CUSTOMER_DATA
          )
      const paidStatusNote =
        riskDecision.requiresKyc
          ? 'Pagamento confirmado. Aguardando validação KYC para liberar entrega.'
          : paidFlowStatus === QUICK_DELIVERY_FLOW.DELIVERED
          ? 'Pagamento confirmado e entrega concluída.'
          : paidFlowStatus === QUICK_DELIVERY_FLOW.DELIVERY_IN_PROGRESS
            ? 'Pagamento confirmado. Entrega em andamento pela equipe.'
            : paidFlowStatus === QUICK_DELIVERY_FLOW.DELIVERY_REQUESTED
              ? 'Pagamento confirmado. Dados AdsPower recebidos e entrega em fila.'
              : 'Pagamento confirmado. Envie seu e-mail AdsPower e confirme perfil liberado para iniciar a entrega.'

      // 3a. Atualiza checkout como PAID
      await prisma.quickSaleCheckout.update({
        where: { id: quickCheckout.id },
        data: {
          status:         'PAID',
          paidAt,
          interE2eId:     e2eid ?? null,
          webhookPayload: payload as never,
          warrantyEndsAt,
          deliveryFlowStatus: paidFlowStatus,
          deliveryStatusNote: paidStatusNote,
        },
      })
      checkoutsUpdated++

      // 3a.1. Lança receita no Financeiro (vendas do dia / ERP)
      const quickIncentive = await calculateQuickSaleIncentiveBreakdown(quickCheckout.id)
      await prisma.quickSaleCheckout.update({
        where: { id: quickCheckout.id },
        data: {
          sellerId: quickIncentive.sellerId,
          managerId: quickIncentive.managerId,
          sellerCommission: quickIncentive.sellerCommission,
          managerCommission: quickIncentive.managerCommission,
          supplierCost: quickIncentive.supplierCost,
          netProfit: quickIncentive.netProfit,
          sellerMetaUnlocked: quickIncentive.sellerMetaUnlocked,
        },
      }).catch((e) => console.error('[QuickCheckout] Falha ao persistir incentivos:', e))

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
          netProfit:     quickIncentive.netProfit,
          description:   `Venda Rápida: ${quickCheckout.listing.title} | Checkout: ${quickCheckout.id} | Cliente: ${quickCheckout.buyerName}`,
        },
      }).catch((e) => console.error('[QuickCheckout] Falha ao registrar receita financeira:', e))

      await prisma.auditLog.create({
        data: {
          action: 'QUICK_SALE_ORDER_CONFIRMED',
          entity: 'QuickSaleCheckout',
          entityId: quickCheckout.id,
          userId: quickCheckout.sellerId ?? quickCheckout.managerId ?? null,
          details: {
            checkoutId: quickCheckout.id,
            buyerName: quickCheckout.buyerName,
            buyerWhatsapp: quickCheckout.buyerWhatsapp,
            listingId: quickCheckout.listingId,
            listingTitle: quickCheckout.listing.title,
            stockProductCode: quickCheckout.stockProductCodeSnapshot,
            stockProductName: quickCheckout.stockProductNameSnapshot,
            qty: quickCheckout.qty,
            totalAmount: Number(quickCheckout.totalAmount),
            paidAt: paidAt.toISOString(),
          },
        },
      }).catch((e) => console.error('[QuickCheckout] Falha ao registrar auditoria da compra:', e))

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
            reason:   `Venda Rápida — Comprador: ${quickCheckout.buyerName} | CPF: ${quickCheckout.buyerCpf} | Produto estoque: ${quickCheckout.stockProductCodeSnapshot ?? quickCheckout.stockProductNameSnapshot ?? quickCheckout.listing.title} | Checkout: ${quickCheckout.id}`,
          })),
          skipDuplicates: true,
        }).catch((e) => console.error('[QuickCheckout] Falha ao registrar movimentos:', e))
      }

      // 3c. Utmify — S2S com retry, profileType tag e persistência de utmifyOrderId
      // Regra GuardianGate: quando exigir KYC, só envia após aprovação manual.
      let quickUtmifySynced = Boolean(quickCheckout.utmifySent)
      if (!quickCheckout.utmifySent && !riskDecision.requiresKyc) {
        const utmifyResult = await sendUtmifyQuickSaleConversion({
          checkoutId:   quickCheckout.id,
          listingTitle: quickCheckout.listing.title,
          listingSlug:  quickCheckout.listingId,
          totalAmount:  Number(quickCheckout.totalAmount),
          netProfit:    quickIncentive.netProfit ?? undefined,
          qty:          quickCheckout.qty,
          paidAt,
          createdAt:    quickCheckout.createdAt,
          profileType:  quickCheckout.listing.destinationProfile ?? null,
          buyer: {
            name:      quickCheckout.buyerName,
            email:     quickCheckout.buyerEmail,
            whatsapp:  quickCheckout.buyerWhatsapp,
            document:  quickCheckout.buyerCpf,
          },
          utms: {
            utm_source:   quickCheckout.utmSource                ?? undefined,
            utm_medium:   quickCheckout.utmMedium                ?? undefined,
            utm_campaign: quickCheckout.utmCampaign              ?? undefined,
            utm_content:  quickCheckout.utmContent               ?? undefined,
            utm_term:     quickCheckout.utmTerm                  ?? undefined,
            src:          quickCheckout.utmSrc                   ?? undefined,
          },
        }).catch((e) => { console.error('[Utmify/Quick]', e); return { ok: false } })
        quickUtmifySynced = Boolean(utmifyResult.ok)

        if (utmifyResult.ok) {
          await prisma.quickSaleCheckout.update({
            where: { id: quickCheckout.id },
            data: {
              utmifySent:   true,
              utmifyOrderId: ('utmifyOrderId' in utmifyResult ? utmifyResult.utmifyOrderId : null) ?? null,
            },
          }).catch((e) => console.error('[Utmify/Quick] Falha ao persistir utmifyOrderId:', e))
        }
      }

      notifyAdminsQuickSaleApproved({
        checkoutId:  quickCheckout.id,
        buyerName:   quickCheckout.buyerName,
        listingTitle: quickCheckout.listing.title,
        quantity:    quickCheckout.qty,
        totalAmount: Number(quickCheckout.totalAmount),
      }).catch((e) => console.error('[QuickCheckout] Falha ao notificar admins:', e))

      if (quickIncentive.sellerId) {
        sendSaleIncentiveNotifications({
          sellerId: quickIncentive.sellerId,
          sellerName: quickIncentive.sellerName,
          publicId: quickIncentive.publicAssetId,
          grossValue: quickIncentive.grossValue,
          sellerCommission: quickIncentive.sellerCommission,
          managerCommission: quickIncentive.managerCommission,
          supplierCost: quickIncentive.supplierCost,
          netProfit: quickIncentive.netProfit,
          remainingToUnlock: quickIncentive.sellerRemainingToUnlock ?? 0,
          utmifySynced: quickUtmifySynced,
        }).catch((e) => console.error('[QuickCheckout] Incentive notify', e))
      }

      notifyProductionManagerStockSold({
        assetId: quickIncentive.publicAssetId,
        niche: quickIncentive.nicheForReplenishment,
        listingTitle: quickCheckout.listing.title,
      }).catch((e) => console.error('[QuickCheckout] notify production manager', e))

      registerQuickSaleProductionBonus({
        quickCheckoutId: quickCheckout.id,
        assetIds,
        paidAt,
      }).catch((e) => console.error('[QuickCheckout] production bonus', e))

      await logPixEvent({ txid, e2eid, amount: Number(quickCheckout.totalAmount), status: 'PROCESSED', flowType: 'QUICK_CHECKOUT', relatedId: quickCheckout.id, rawPayload })

      // 3d. Pós-pagamento: decisão híbrida (autoentrega ou KYC) + direcionamento
      const appBase = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
      const deliveryUrl = appBase
        ? `${appBase}/loja/${quickCheckout.listing.slug}?checkoutId=${encodeURIComponent(quickCheckout.id)}`
        : null
      if (riskDecision.requiresKyc && deliveryUrl) {
        const riskReasons = riskDecision.reasons.map(riskReasonLabel).join(' · ')
        const kycGuidanceMessage = [
          '✅ *Pagamento confirmado na Ads Ativos*',
          '',
          `Pedido: #${quickCheckout.id}`,
          `Produto: ${quickCheckout.listing.title}`,
          '',
          '🛡️ *Liberação com verificação de identidade (KYC)*',
          'Pagamento confirmado! Para liberar seu ativo de alto valor, realize a verificação de identidade em nosso portal seguro.',
          '',
          `Motivo da validação: ${riskReasons || 'Política de segurança.'}`,
          deliveryUrl,
          '',
          'Após aprovação da equipe, sua entrega será liberada automaticamente.',
        ].join('\n')
        sendWhatsApp({ phone: quickCheckout.buyerWhatsapp, message: kycGuidanceMessage })
          .catch((e) => console.error('[QuickCheckout] guia kyc whatsapp', e))
        if (quickCheckout.buyerEmail) {
          const terms = buildDeliveryEmail({
            buyerName: quickCheckout.buyerName,
            buyerEmail: quickCheckout.buyerEmail,
            productTitle: quickCheckout.listing.title,
            orderId: quickCheckout.id,
            panelUrl: deliveryUrl,
          })
          sendEmail({
            to: quickCheckout.buyerEmail,
            subject: `🛡️ Verificação KYC pendente — Pedido #${quickCheckout.id}`,
            html: `${terms.html}<p style="font-size:13px;color:#f59e0b;margin-top:12px;">Seu pagamento foi aprovado, mas a liberação deste ativo requer verificação de identidade (KYC). Envie documento e selfie no portal.</p>`,
            text: `Pagamento aprovado para ${quickCheckout.listing.title}. Para liberar a entrega, envie documento e selfie: ${deliveryUrl}`,
          }).catch((e) => console.error('[QuickCheckout] guia kyc email', e))
        }
        if (riskDecision.reasons.includes('BLACKLISTED_IDENTITY')) {
          sendFraudAlertToChatOps({
            title: 'Tentativa de compra com identidade em blacklist',
            severity: 'CRITICAL',
            details: {
              checkoutId: quickCheckout.id,
              buyerName: quickCheckout.buyerName,
              buyerEmail: quickCheckout.buyerEmail ?? 'n/a',
              buyerDocument: quickCheckout.buyerCpf,
              listing: quickCheckout.listing.title,
              riskReasons,
            },
          }).catch(() => {})
        }
      } else if (deliveryUrl) {
        const autoMove = await tryAutoMoveAdspowerProfile({
          checkoutId: quickCheckout.id,
          listingId: quickCheckout.listingId,
        }).catch((e) => {
          console.error('[QuickCheckout] AdsPower move error', e)
          return { moved: false as const, reason: 'MOVE_ERROR' as const }
        })
        if (autoMove.moved) {
          await prisma.quickSaleCheckout.update({
            where: { id: quickCheckout.id },
            data: {
              deliveryFlowStatus: QUICK_DELIVERY_FLOW.DELIVERED,
              deliveryStatusNote: 'Entrega automática concluída após confirmação PIX (baixo risco).',
              deliverySent: true,
            },
          }).catch((e) => console.error('[QuickCheckout] Falha ao marcar autoentrega:', e))
        }
        const autoDeliveryMessage = autoMove.moved
          ? [
              '✅ *Pagamento confirmado na Ads Ativos*',
              '',
              `Pedido: #${quickCheckout.id}`,
              `Produto: ${quickCheckout.listing.title}`,
              '',
              '🚀 *Entrega automática concluída (baixo risco)*',
              'Seu ativo foi liberado sem etapa adicional de KYC.',
              '',
              `Acompanhe detalhes: ${deliveryUrl}`,
            ].join('\n')
          : [
              '✅ *Pagamento confirmado na Ads Ativos*',
              '',
              `Pedido: #${quickCheckout.id}`,
              `Produto: ${quickCheckout.listing.title}`,
              '',
              '🚚 *Próximo passo obrigatório:*',
              'Abra o link abaixo, informe seu e-mail do AdsPower e confirme que o perfil está liberado.',
              '',
              deliveryUrl,
              '',
              'Sem perfil AdsPower liberado o sistema não autoriza envio da entrega.',
            ].join('\n')
        sendWhatsApp({ phone: quickCheckout.buyerWhatsapp, message: autoDeliveryMessage })
          .catch((e) => console.error('[QuickCheckout] guia entrega whatsapp', e))
        if (quickCheckout.buyerEmail) {
          const emailPayload = buildDeliveryEmail({
            buyerName: quickCheckout.buyerName,
            buyerEmail: quickCheckout.buyerEmail,
            productTitle: quickCheckout.listing.title,
            orderId: quickCheckout.id,
            panelUrl: deliveryUrl,
            warrantyEndsAt,
          })
          sendEmail({
            to: quickCheckout.buyerEmail,
            subject: emailPayload.subject,
            html: emailPayload.html,
            text: emailPayload.text,
          }).catch((e) => console.error('[QuickCheckout] email pós-pagamento', e))
        }
      } else {
        const guidanceMessage = [
          '✅ *Pagamento confirmado na Ads Ativos*',
          '',
          `Pedido: #${quickCheckout.id}`,
          `Produto: ${quickCheckout.listing.title}`,
          '',
          '🚚 *Próximo passo obrigatório:*',
          'Abra o link abaixo, informe seu e-mail do AdsPower e confirme que o perfil está liberado.',
          '',
          deliveryUrl,
          '',
          'Sem perfil AdsPower liberado o sistema não autoriza envio da entrega.',
        ].join('\n')
        sendWhatsApp({ phone: quickCheckout.buyerWhatsapp, message: guidanceMessage })
          .catch((e) => console.error('[QuickCheckout] guia entrega whatsapp', e))
      }
    }

    // Se nenhum fluxo fez match para este txid, grava NOT_FOUND
    if (!order && !checkout && !quickCheckout) {
      await logPixEvent({
        txid,
        e2eid,
        amount:    pixAmount,
        status:    'NOT_FOUND',
        rawPayload,
        errorMsg:  'txid não encontrado em nenhum fluxo (Order / SalesCheckout / QuickCheckout)',
      })
    }
  }

  return NextResponse.json({
    ok:                true,
    txidsFound:        pixItems.length,
    ordersMarkedPaid:  ordersUpdated,
    checkoutsPaid:     checkoutsUpdated,
  })
}
