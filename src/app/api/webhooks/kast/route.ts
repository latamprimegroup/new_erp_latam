/**
 * POST /api/webhooks/kast
 *
 * IPN (Instant Payment Notification) da NOWPayments — Motor Cripto do War Room.
 *
 * Fluxo ao receber status "finished" (pagamento confirmado on-chain):
 *   1. Verifica assinatura HMAC-SHA512 (x-nowpayments-sig)
 *   2. Anti-duplicata por payment_id
 *   3. Identifica a order (QuickSaleCheckout ou AssetSalesOrder) via order_id
 *   4. Calcula lucro líquido: valor recebido − gas fee da rede
 *   5. Converte cripto → USD → BRL (FX live)
 *   6. Cria Transaction (gateway=KAST, currency=USD)
 *   7. Marca order como PAID
 *   8. Dispara Utmify Global com tag "Cripto USDT"
 *   9. Log de auditoria
 *
 * Configura o IPN em: NOWPayments Dashboard → Settings → Payments → IPN
 * URL: https://seu-dominio.com/api/webhooks/kast
 * IPN Secret: NOWPAYMENTS_IPN_SECRET (env var)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  verifyKastWebhook,
  calcCryptoNetProfit,
  type SupportedCoin,
  SUPPORTED_COINS,
} from '@/lib/kast/client'

export const runtime = 'nodejs'

// ─── Tipos do payload IPN ─────────────────────────────────────────────────────

type NowPaymentsIPN = {
  payment_id:        number | string
  payment_status:    string
  pay_address:       string
  price_amount:      number
  price_currency:    string
  pay_amount:        number
  actually_paid:     number
  pay_currency:      string
  order_id:          string
  order_description: string
  created_at:        string
  updated_at:        string
  purchase_id?:      string
  outcome_amount?:   number
  outcome_currency?: string
}

// Status que representa pagamento COMPLETO e confirmado on-chain
const PAID_STATUS = new Set(['finished', 'confirmed'])

const QUICK_DELIVERY_FLOW = {
  WAITING_CUSTOMER_DATA: 'WAITING_CUSTOMER_DATA',
} as const

// ─── Utmify para conversão cripto ─────────────────────────────────────────────

async function sendCryptoConversionToUtmify(opts: {
  paymentId:    string
  orderId:      string
  amountUsd:    number
  amountBrl:    number
  payCurrency:  string
  confirmedAt:  string
}) {
  const UTMIFY_URL = 'https://api.utmify.com.br/api-credentials/orders'
  const UTMIFY_KEY = process.env.UTMIFY_API_TOKEN ?? 'tvlOulmIJi33AjKArERtEiOfGgiZ1h98KD6x'

  const coinInfo = SUPPORTED_COINS[opts.payCurrency as SupportedCoin]

  const order = {
    orderId:       `KAST-${opts.paymentId}`,
    platform:      'NOWPayments Cripto',
    paymentMethod: coinInfo?.network ?? 'crypto',
    status:        'paid',
    createdAt:     opts.confirmedAt,
    approvedDate:  opts.confirmedAt,
    customer: {
      name:     'Crypto Client',
      email:    `kast+${opts.paymentId.toString().slice(0, 8)}@adsativos.com`,
      phone:    '',
      document: '',
    },
    products: [{
      id:           `KAST-${opts.payCurrency}`,
      name:         `${coinInfo?.label ?? opts.payCurrency} — Ads Ativos Global`,
      planId:       'kast-crypto',
      planName:     'Cripto USDT',
      quantity:     1,
      priceInCents: Math.round(opts.amountUsd * 100),
    }],
    trackingParameters: {
      utm_source:   'kast',
      utm_medium:   coinInfo?.network?.toLowerCase() ?? 'crypto',
      utm_campaign: 'cripto-internacional',
      utm_content:  opts.payCurrency,
    },
    commission: {
      totalPriceInCents:     Math.round(opts.amountBrl * 100),
      gatewayFeeInCents:     Math.round((opts.amountUsd * 0.005) * 100), // 0.5% NOWPayments
      userCommissionInCents: Math.round(opts.amountBrl * 0.995 * 100),
    },
  }

  try {
    const res = await fetch(UTMIFY_URL, {
      method:  'POST',
      headers: { 'x-api-token': UTMIFY_KEY, 'Content-Type': 'application/json' },
      body:    JSON.stringify(order),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.error(`[Kast→Utmify] ❌ ${res.status}: ${err}`)
    } else {
      console.log(`[Kast→Utmify] ✅ Conversão cripto enviada — KAST-${opts.paymentId}`)
    }
  } catch (e) {
    console.error('[Kast→Utmify] Falha de rede:', e)
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const sigHeader = req.headers.get('x-nowpayments-sig') ?? ''
  const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET ?? ''

  // ── 1. Verificação de assinatura HMAC-SHA512 ────────────────────────────────
  let payload: NowPaymentsIPN
  try {
    payload = JSON.parse(rawBody) as NowPaymentsIPN
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (ipnSecret && sigHeader) {
    const valid = verifyKastWebhook(
      payload as unknown as Record<string, unknown>,
      sigHeader,
      ipnSecret,
    )
    if (!valid) {
      console.warn('[Kast IPN] ❌ Assinatura inválida')
      return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
    }
  } else if (!ipnSecret) {
    console.warn('[Kast IPN] ⚠️ NOWPAYMENTS_IPN_SECRET não configurado — verificação ignorada')
  }

  const paymentId = String(payload.payment_id)
  const status    = payload.payment_status

  console.log(`[Kast IPN] payment_id=${paymentId} status=${status} order_id=${payload.order_id}`)

  // ── 2. Ignorar eventos que não sejam pagamento completo ─────────────────────
  if (!PAID_STATUS.has(status)) {
    return NextResponse.json({ ok: true, action: 'ignored', status })
  }

  // ── 3. Anti-duplicata ────────────────────────────────────────────────────────
  const existing = await prisma.transaction.findFirst({
    where: { externalRef: paymentId, gateway: 'KAST' },
    select: { id: true },
  })
  if (existing) {
    console.log(`[Kast IPN] DUPLICATE payment_id=${paymentId}`)
    return NextResponse.json({ ok: true, action: 'duplicate' })
  }

  // ── 4. Lucro líquido cripto ─────────────────────────────────────────────────
  const receivedAmount = Number(payload.actually_paid ?? payload.pay_amount)
  const payCurrency    = payload.pay_currency as SupportedCoin
  const profit         = await calcCryptoNetProfit({
    coin:           payCurrency,
    receivedAmount,
  })

  console.log(`[Kast IPN] ${receivedAmount} ${payCurrency} | USD ${profit.grossUsd} | Gas ${profit.gasFeeUsd} | Net BRL ${profit.netBrl}`)

  // ── 5. Registrar Transaction ────────────────────────────────────────────────
  const newTx = await prisma.transaction.create({
    data: {
      type:            'ASSET_SALE',
      gateway:         'KAST',
      currency:        'USD',
      grossAmount:     profit.grossUsd,
      gatewayFee:      profit.gasFeeUsd,
      costAmount:      0,
      profitAmount:    profit.netUsd,
      profitMarginPct: profit.marginPct,
      fxRateBrlUsd:    profit.fxRateBrl,
      externalRef:     paymentId,
      status:          'APPROVED',
      occurredAt:      new Date(payload.updated_at ?? new Date()),
    },
  })

  console.log(`[Kast IPN] ✅ Transaction criada: ${newTx.id}`)

  // ── 6. Marcar order como PAID ────────────────────────────────────────────────
  let orderUpdated = false
  const orderId = payload.order_id

  if (orderId) {
    // Tenta QuickSaleCheckout
    const checkout = await prisma.quickSaleCheckout.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    })

    if (checkout && checkout.status !== 'PAID') {
      const paidAt = new Date(payload.updated_at ?? new Date())
      await prisma.quickSaleCheckout.update({
        where: { id: orderId },
        data: {
          status:  'PAID',
          paidAt,
          deliveryFlowStatus: QUICK_DELIVERY_FLOW.WAITING_CUSTOMER_DATA,
          deliveryStatusNote: 'Pagamento confirmado. Envie seu e-mail AdsPower e confirme perfil liberado para iniciar a entrega.',
        },
      })
      orderUpdated = true
      console.log(`[Kast IPN] QuickSaleCheckout ${orderId} → PAID`)
    }

    if (!orderUpdated) {
      // Tenta AssetSalesOrder
      const saleOrder = await prisma.assetSalesOrder.findUnique({
        where: { id: orderId },
        select: { id: true, status: true },
      })

      if (saleOrder && !['CLIENT_PAID', 'DELIVERED'].includes(saleOrder.status)) {
        await prisma.assetSalesOrder.update({
          where: { id: orderId },
          data:  { status: 'CLIENT_PAID' },
        }).catch(() => null)
        orderUpdated = true
        console.log(`[Kast IPN] AssetSalesOrder ${orderId} → PAID`)
      }
    }
  }

  // ── 7. Utmify Global — conversão cripto ────────────────────────────────────
  void sendCryptoConversionToUtmify({
    paymentId,
    orderId,
    amountUsd:   profit.grossUsd,
    amountBrl:   profit.netBrl,
    payCurrency: payload.pay_currency,
    confirmedAt: payload.updated_at ?? new Date().toISOString(),
  })

  // ── 8. Auditoria ────────────────────────────────────────────────────────────
  await prisma.auditLog.create({
    data: {
      action:   'KAST_CRYPTO_PAID',
      entity:   'Transaction',
      entityId: newTx.id,
      details: {
        paymentId,
        orderId,
        payCurrency:    payload.pay_currency,
        receivedAmount,
        grossUsd:       profit.grossUsd,
        gasFeeUsd:      profit.gasFeeUsd,
        netBrl:         profit.netBrl,
        orderUpdated,
        nowPaymentsStatus: status,
      },
    },
  }).catch(() => null)

  return NextResponse.json({
    ok:            true,
    action:        'processed',
    transactionId: newTx.id,
    grossUsd:      profit.grossUsd,
    netBrl:        profit.netBrl,
    orderUpdated,
  })
}
