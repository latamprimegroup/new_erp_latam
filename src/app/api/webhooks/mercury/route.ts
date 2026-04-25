/**
 * POST /api/webhooks/mercury
 *
 * Webhook Mercury Bank — recebe notificações de transações (ACH/Wire crédito).
 *
 * Fluxo ao receber um crédito confirmado (status=sent, amount > 0):
 *   1. Verifica assinatura HMAC-SHA256 (Mercury-Signature header)
 *   2. Busca detalhes completos da transação via Mercury API
 *   3. Identifica cliente por referência (externalMemo / note)
 *   4. Converte USD→BRL em tempo real (open.er-api.com)
 *   5. Cria registro em Transaction (gateway=MERCURY)
 *   6. Dispara conversão Utmify marcada como "International USD"
 *   7. Notifica CEO via log estruturado
 *
 * Configura o webhook em: Mercury Dashboard → Settings → Developer → Webhooks
 * URL: https://seu-domínio.com/api/webhooks/mercury
 * Events: transaction.created, transaction.updated
 * Secret: MERCURY_WEBHOOK_SECRET (env var)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  verifyMercuryWebhook,
  getMercuryAccount,
  usdToBrl,
  MercuryApiError,
} from '@/lib/mercury/client'
import { quickSaleMercuryRefKey, quickSaleOrderLookupKey } from '@/lib/quick-sale-payments'

export const runtime = 'nodejs'

// ─── Tipos do payload Mercury ─────────────────────────────────────────────────

type MercuryWebhookEvent = {
  id:              string
  resourceType:    'transaction' | 'checkingAccount' | 'savingsAccount'
  resourceId:      string
  operationType:   'create' | 'update'
  resourceVersion: number
  occurredAt:      string
  changedPaths:    string[]
  mergePatch:      Record<string, unknown>
  previousValues?: Record<string, unknown>
}

// Tipos de transação que representam créditos recebidos
const CREDIT_KINDS = new Set([
  'achCredit',
  'wireCredit',
  'checkDeposit',
  'internalTransferCredit',
  'creditCardCredit',
])

// ─── Identificação de cliente por referência ──────────────────────────────────

/**
 * Tenta encontrar um ClientProfile ou QuickSaleCheckout pela referência
 * contida na transação Mercury (externalMemo / note / bankDescription).
 *
 * Formatos suportados:
 *   - "AA-CONT-000001" → adsId no Asset / Checkout
 *   - "ADS-..." → prefixo de pedido
 *   - Email → email do cliente
 */
async function resolveClientByReference(
  ref: string | null,
): Promise<{ clientId: string | null; checkoutId: string | null }> {
  if (!ref) return { clientId: null, checkoutId: null }

  const refClean = ref.trim()
  const refUpper = refClean.toUpperCase()

  const byMercuryRef = await prisma.systemSetting.findUnique({
    where: { key: quickSaleMercuryRefKey(refClean) },
    select: { value: true },
  }).catch(() => null)
  if (byMercuryRef?.value) {
    const directCheckout = await prisma.quickSaleCheckout.findUnique({
      where: { id: byMercuryRef.value },
      select: { id: true },
    }).catch(() => null)
    if (directCheckout) {
      return { clientId: null, checkoutId: directCheckout.id }
    }
  }

  const orderMatch = refUpper.match(/VR-\d{6}/)
  if (orderMatch?.[0]) {
    const byOrder = await prisma.systemSetting.findUnique({
      where: { key: quickSaleOrderLookupKey(orderMatch[0]) },
      select: { value: true },
    }).catch(() => null)
    if (byOrder?.value) {
      const orderCheckout = await prisma.quickSaleCheckout.findUnique({
        where: { id: byOrder.value },
        select: { id: true },
      }).catch(() => null)
      if (orderCheckout) {
        return { clientId: null, checkoutId: orderCheckout.id }
      }
    }
  }

  // Procura email
  if (refClean.includes('@')) {
    const user = await prisma.user.findFirst({
      where:  { email: refClean },
      select: { id: true },
    }).catch(() => null)
    if (user?.id) {
      return { clientId: null, checkoutId: null }
    }
  }

  // Procura checkout por adsId ou referência
  const checkout = await prisma.quickSaleCheckout.findFirst({
    where: {
      OR: [
        { interTxid: { contains: refClean } },
        { buyerEmail: { contains: refClean, mode: 'insensitive' } },
        { id: refClean.startsWith('c') ? refClean : undefined },
      ].filter(Boolean),
    },
    select: { id: true },
  })

  if (checkout) {
    return { clientId: null, checkoutId: checkout.id }
  }

  return { clientId: null, checkoutId: null }
}

// ─── Utmify para conversão internacional ─────────────────────────────────────

async function sendMercuryConversionToUtmify(opts: {
  mercuryTxId:  string
  amountUsd:    number
  amountBrl:    number
  description:  string
  counterparty: string | null
  occurredAt:   string
}) {
  const UTMIFY_URL = 'https://api.utmify.com.br/api-credentials/orders'
  const UTMIFY_KEY = process.env.UTMIFY_API_TOKEN ?? 'tvlOulmIJi33AjKArERtEiOfGgiZ1h98KD6x'

  const order = {
    orderId:       `MERCURY-${opts.mercuryTxId}`,
    platform:      'Mercury Bank USD',
    paymentMethod: 'wire',
    status:        'paid',
    createdAt:     opts.occurredAt,
    approvedDate:  opts.occurredAt,
    customer: {
      name:     opts.counterparty ?? 'International Client',
      email:    `mercury+${opts.mercuryTxId.slice(0, 8)}@adsativos.com`,
      phone:    '',
      document: '',
    },
    products: [{
      id:           'MERCURY-INT-USD',
      name:         opts.description || 'International USD Payment',
      planId:       'mercury-wire',
      planName:     'International USD',
      quantity:     1,
      priceInCents: Math.round(opts.amountUsd * 100),
    }],
    trackingParameters: {
      utm_source:   'mercury',
      utm_medium:   'wire',
      utm_campaign: 'international-usd',
    },
    commission: {
      totalPriceInCents:     Math.round(opts.amountBrl * 100),
      gatewayFeeInCents:     Math.round(opts.amountBrl * 0.005 * 100), // 0.5% fee Mercury
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
      console.error(`[Mercury→Utmify] ❌ ${res.status}: ${err}`)
    } else {
      console.log(`[Mercury→Utmify] ✅ Conversão enviada — MERCURY-${opts.mercuryTxId}`)
    }
  } catch (e) {
    console.error('[Mercury→Utmify] Falha de rede:', e)
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signatureHeader = req.headers.get('Mercury-Signature') ?? ''
  const secretKey       = process.env.MERCURY_WEBHOOK_SECRET ?? ''

  // ── 1. Verificação de assinatura ────────────────────────────────────────────
  if (secretKey) {
    const { valid, reason } = verifyMercuryWebhook(rawBody, signatureHeader, secretKey)
    if (!valid) {
      console.warn(`[Mercury Webhook] ❌ Assinatura inválida: ${reason}`)
      return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
    }
  } else {
    console.warn('[Mercury Webhook] ⚠️ MERCURY_WEBHOOK_SECRET não configurado — verificação ignorada')
  }

  let event: MercuryWebhookEvent
  try {
    event = JSON.parse(rawBody) as MercuryWebhookEvent
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // ── 2. Filtrar apenas transações de crédito confirmadas ─────────────────────
  const isTransaction   = event.resourceType === 'transaction'
  const isConfirmed     = event.mergePatch?.status === 'sent'
  const txKind          = event.mergePatch?.kind as string | undefined
  const isCredit        = txKind ? CREDIT_KINDS.has(txKind) : false
  const rawAmount       = Number(event.mergePatch?.amount ?? 0)
  const isPositive      = rawAmount > 0

  if (!isTransaction || !isConfirmed || !isCredit || !isPositive) {
    // Evento irrelevante (débito, pendente, balance update, etc.)
    return NextResponse.json({ ok: true, action: 'ignored', reason: 'Não é crédito confirmado' })
  }

  // ── 3. Anti-duplicata — verificar se este evento já foi processado ──────────
  const existingTx = await prisma.transaction.findFirst({
    where: { externalRef: event.resourceId, gateway: 'MERCURY' },
    select: { id: true },
  })
  if (existingTx) {
    console.log(`[Mercury Webhook] DUPLICATE — resourceId=${event.resourceId}`)
    return NextResponse.json({ ok: true, action: 'duplicate' })
  }

  // ── 4. Buscar detalhes completos da transação via Mercury API ───────────────
  let accountId: string | null = null
  let bankDescription: string | null = null
  let externalMemo: string | null = null
  let counterpartyName: string | null = null
  let note: string | null = null

  try {
    // Tenta buscar a conta para pegar o accountId (se configurado)
    const configured = process.env.MERCURY_ACCOUNT_ID
    accountId = configured ?? null

    if (accountId) {
      const acct = await getMercuryAccount(accountId)
      bankDescription  = acct.name
    }

    // Os campos podem estar no mergePatch do webhook
    bankDescription  = event.mergePatch?.bankDescription as string ?? bankDescription
    externalMemo     = event.mergePatch?.externalMemo as string ?? null
    counterpartyName = event.mergePatch?.counterpartyName as string ?? null
    note             = event.mergePatch?.note as string ?? null
  } catch (e) {
    if (e instanceof MercuryApiError) {
      console.warn(`[Mercury Webhook] Falha ao buscar detalhes do account: ${e.message}`)
    }
  }

  // ── 5. Conversão USD → BRL em tempo real ───────────────────────────────────
  const amountUsd = rawAmount
  const { brl: amountBrl, rate: fxRate } = await usdToBrl(amountUsd)

  // ── 6. Identificar cliente pela referência ──────────────────────────────────
  const reference = externalMemo ?? note ?? bankDescription
  const { clientId, checkoutId } = await resolveClientByReference(reference)

  // ── 7. Registrar Transaction no banco ──────────────────────────────────────
  const gatewayFeeUsd = amountUsd * 0.005 // 0.5% taxa estimada Mercury
  const gatewayFeeBrl = gatewayFeeUsd * fxRate
  const profitBrl     = amountBrl - gatewayFeeBrl

  let newTransaction
  try {
    newTransaction = await prisma.transaction.create({
      data: {
        type:           'ASSET_SALE',
        gateway:        'MERCURY',
        currency:       'USD',
        grossAmount:    amountUsd,
        gatewayFee:     gatewayFeeUsd,
        costAmount:     0,
        profitAmount:   profitBrl / fxRate, // em USD
        profitMarginPct: ((profitBrl / amountBrl) * 100),
        fxRateBrlUsd:   fxRate,
        externalRef:    event.resourceId,
        clientId:       clientId ?? null,
        checkoutId:     checkoutId ?? null,
        status:         'APPROVED',
        occurredAt:     new Date(event.occurredAt),
      },
    })
    console.log(`[Mercury Webhook] ✅ Transaction criada: ${newTransaction.id} — USD ${amountUsd} (≈ BRL ${amountBrl})`)
  } catch (e) {
    console.error('[Mercury Webhook] Falha ao criar Transaction:', e)
    return NextResponse.json({ error: 'Erro ao registrar transação' }, { status: 500 })
  }

  // ── 8. Marcar checkout global como PAID quando conciliado ───────────────────
  let orderUpdated = false
  if (checkoutId) {
    const quickCheckout = await prisma.quickSaleCheckout.findUnique({
      where: { id: checkoutId },
      select: { id: true, status: true },
    }).catch(() => null)
    if (quickCheckout && quickCheckout.status !== 'PAID') {
      await prisma.quickSaleCheckout.update({
        where: { id: quickCheckout.id },
        data: {
          status: 'PAID',
          paidAt: new Date(event.occurredAt),
          deliveryFlowStatus: 'WAITING_CUSTOMER_DATA',
          deliveryStatusNote: 'Pagamento Mercury confirmado. Envie seu e-mail AdsPower e confirme perfil liberado para iniciar a entrega.',
        },
      }).catch(() => null)
      orderUpdated = true
      console.log(`[Mercury Webhook] QuickSaleCheckout ${quickCheckout.id} → PAID`)
    }
  }

  // ── 9. Utmify — conversão Internacional USD ────────────────────────────────
  void sendMercuryConversionToUtmify({
    mercuryTxId:  event.resourceId,
    amountUsd,
    amountBrl,
    description:  bankDescription ?? txKind ?? 'ACH/Wire',
    counterparty: counterpartyName,
    occurredAt:   event.occurredAt,
  })

  // ── 10. Log de auditoria ───────────────────────────────────────────────────
  await prisma.auditLog.create({
    data: {
      action:   'MERCURY_WIRE_RECEIVED',
      entity:   'Transaction',
      entityId: newTransaction.id,
      details: {
        mercuryEventId: event.id,
        amountUsd,
        amountBrl,
        fxRate,
        kind: txKind,
        counterparty: counterpartyName,
        reference,
        checkoutId,
        orderUpdated,
      },
    },
  }).catch(() => null)

  return NextResponse.json({
    ok:            true,
    action:        'processed',
    transactionId: newTransaction.id,
    amountUsd,
    amountBrl,
    fxRate,
    orderUpdated,
  })
}
