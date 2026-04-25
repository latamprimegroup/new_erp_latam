/**
 * POST /api/webhooks/pagsmile
 *
 * Webhook da Pagsmile para notificações de pagamento (cartão recorrente).
 *
 * Eventos processados:
 *   - trade_status = SUCCESS  → Assinatura renovada, libera acesso
 *   - trade_status = FAILED   → Incrementa retryCount, muda status para PAST_DUE
 *   - trade_status = REFUNDED → Cancela assinatura
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPagsmileWebhook } from '@/lib/pagsmile/client'
import { sendUtmifyQuickSaleConversion } from '@/lib/utmify'
import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'
import { addMonths, addQuarters, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { BRAND } from '@/lib/brand'

export const runtime = 'nodejs'

function nextBillingDate(cycle: string): Date {
  const now = new Date()
  if (cycle === 'QUARTERLY') return addQuarters(now, 1)
  if (cycle === 'ANNUAL') {
    const d = new Date(now)
    d.setFullYear(d.getFullYear() + 1)
    return d
  }
  return addMonths(now, 1)
}

const MAX_RETRIES = 3

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // Valida assinatura Pagsmile
  if (!verifyPagsmileWebhook(body)) {
    console.warn('[Pagsmile Webhook] Assinatura inválida')
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
  }

  const outTradeNo  = body.out_trade_no as string | undefined
  const tradeStatus = (body.trade_status as string | undefined)?.toUpperCase()
  const tradeNo     = body.trade_no as string | undefined

  if (!outTradeNo) return NextResponse.json({ return_code: 'SUCCESS' })

  // outTradeNo = "{subscriptionId}-{YYYYMM}" (formato definido no billing-cron)
  const subscriptionId = outTradeNo.split('-').slice(0, -1).join('-')
  if (!subscriptionId) return NextResponse.json({ return_code: 'SUCCESS' })

  const sub = await prisma.subscription.findUnique({
    where:   { id: subscriptionId },
    include: {
      client: {
        select: {
          id:      true,
          whatsapp: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  }).catch(() => null)

  if (!sub) {
    console.warn('[Pagsmile Webhook] Assinatura não encontrada:', subscriptionId)
    return NextResponse.json({ return_code: 'SUCCESS' })
  }

  // ── Pagamento APROVADO ────────────────────────────────────────────────────
  if (tradeStatus === 'SUCCESS') {
    const nextBilling = nextBillingDate(sub.billingCycle)

    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status:         'ACTIVE',
        nextBillingAt:  nextBilling,
        retryCount:     0,
        lastBillingError: null,
        externalPlanId: tradeNo ?? sub.externalPlanId,
      },
    })

    // Registra Transaction
    const amount      = Number(sub.amount)
    const gatewayFee  = Math.round(amount * 0.035 * 100) / 100 // Pagsmile ~3.5%
    const profit      = amount - gatewayFee
    await prisma.transaction.create({
      data: {
        type:           'SUBSCRIPTION_FEE',
        gateway:        'STRIPE', // Pagsmile usa Stripe internamente no Brasil
        currency:       sub.currency,
        grossAmount:    amount,
        gatewayFee,
        costAmount:     0,
        profitAmount:   profit,
        profitMarginPct: Math.round((profit / amount) * 10000) / 100,
        profileType:    sub.profileType,
        subscriptionId: sub.id,
        clientId:       sub.clientId,
        status:         'APPROVED',
        occurredAt:     new Date(),
        externalRef:    tradeNo,
        checkoutId:     outTradeNo,
      },
    }).catch((e) => console.error('[Pagsmile] Falha ao criar Transaction:', e))

    // WhatsApp de confirmação de renovação
    if (sub.client.whatsapp) {
      const dateStr = format(nextBilling, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
      const msg = [
        `🔄 *ASSINATURA RENOVADA — ${BRAND.name}*`,
        ``,
        `Olá, *${sub.client.user?.name ?? 'Cliente'}*! Sua assinatura *${sub.planName}* foi renovada com sucesso.`,
        ``,
        `💳 Pagamento via cartão confirmado.`,
        `📅 Próxima renovação: *${dateStr}*`,
        ``,
        `🔗 Acesse sua área: ${process.env.NEXTAUTH_URL ?? ''}/dashboard/cliente`,
        ``,
        `_${BRAND.name} · ${BRAND.taglinePT}_`,
      ].join('\n')
      sendWhatsApp({ phone: sub.client.whatsapp, message: msg })
        .catch((e) => console.error('[Pagsmile] WA confirmação falhou:', e))
    }

    // Utmify — LTV tracking de renovação
    if (sub.client.whatsapp && sub.client.user?.email) {
      sendUtmifyQuickSaleConversion({
        checkoutId:   `${sub.id}-renewal-${Date.now()}`,
        listingTitle: `${sub.planName} (Renovação)`,
        listingSlug:  sub.profileType.toLowerCase(),
        totalAmount:  amount,
        netProfit:    profit,
        qty:          1,
        paidAt:       new Date(),
        createdAt:    new Date(),
        profileType:  sub.profileType,
        buyer: {
          name:     sub.client.user.name ?? 'Cliente',
          email:    sub.client.user.email,
          whatsapp: sub.client.whatsapp ?? '',
        },
        utms: {},
      }).catch(() => {})
    }

    return NextResponse.json({ return_code: 'SUCCESS' })
  }

  // ── Pagamento FALHOU ──────────────────────────────────────────────────────
  if (tradeStatus === 'FAILED' || tradeStatus === 'DECLINED') {
    const newRetryCount = (sub.retryCount ?? 0) + 1
    const newStatus     = newRetryCount >= MAX_RETRIES ? 'PAST_DUE' : sub.status

    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status:           newStatus,
        retryCount:       newRetryCount,
        lastBillingError: (body.msg ?? body.return_msg ?? 'Cobrança recusada') as string,
      },
    })

    // WhatsApp de falha de pagamento
    if (sub.client.whatsapp) {
      const retriesLeft = MAX_RETRIES - newRetryCount
      const msg = newStatus === 'PAST_DUE'
        ? [
            `⚠️ *ACESSO SUSPENSO — ${BRAND.name}*`,
            ``,
            `Olá, *${sub.client.user?.name ?? 'Cliente'}*. Não conseguimos processar o pagamento da sua assinatura *${sub.planName}* após ${MAX_RETRIES} tentativas.`,
            ``,
            `🔒 Seu acesso foi temporariamente suspenso.`,
            ``,
            `Para reativar, acesse:`,
            `${process.env.NEXTAUTH_URL ?? ''}/dashboard/cliente/pagamento-pendente`,
            ``,
            `Precisa de ajuda? Fale conosco: wa.me/${BRAND.supportWA}`,
          ].join('\n')
        : [
            `⚠️ *FALHA NO PAGAMENTO — ${BRAND.name}*`,
            ``,
            `Olá, *${sub.client.user?.name ?? 'Cliente'}*. Houve uma falha ao cobrar sua assinatura *${sub.planName}*.`,
            `Tentaremos novamente automaticamente (${retriesLeft} tentativa${retriesLeft !== 1 ? 's' : ''} restante).`,
            ``,
            `Para atualizar seu cartão: ${process.env.NEXTAUTH_URL ?? ''}/dashboard/cliente/pagamento-pendente`,
          ].join('\n')

      sendWhatsApp({ phone: sub.client.whatsapp, message: msg })
        .catch((e) => console.error('[Pagsmile] WA falha falhou:', e))
    }

    return NextResponse.json({ return_code: 'SUCCESS' })
  }

  // ── Reembolso ─────────────────────────────────────────────────────────────
  if (tradeStatus === 'REFUNDED') {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    })
    return NextResponse.json({ return_code: 'SUCCESS' })
  }

  return NextResponse.json({ return_code: 'SUCCESS' })
}
