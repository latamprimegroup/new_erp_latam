/**
 * POST /api/crypto/invoice
 *
 * Gera uma cobrança em cripto (USDT/USDC) vinculada a uma venda.
 *
 * Fluxo:
 *   1. Valida o orderId (QuickSaleCheckout ou AssetSalesOrder)
 *   2. Converte o valor BRL → USD → cripto via getKastQuote()
 *   3. Cria invoice na NOWPayments (createKastInvoice())
 *   4. Salva invoiceId + URL no checkout para exibição ao cliente
 *   5. Retorna: { invoiceUrl, payAddress, payAmount, payCurrency, quote }
 *
 * Body (JSON):
 *   orderId      — ID do QuickSaleCheckout ou AssetSalesOrder
 *   orderType    — "quick_sale" | "asset_sale" (default: quick_sale)
 *   coin         — moeda cripto (default: usdttrc20)
 *
 * O cliente é redirecionado para `invoiceUrl` onde completa o pagamento
 * na interface NOWPayments (não requer integração de UI no ERP).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  getKastQuote,
  createKastInvoice,
  type SupportedCoin,
  SUPPORTED_COINS,
} from '@/lib/kast/client'
import { z } from 'zod'

const Schema = z.object({
  orderId:   z.string().min(1),
  orderType: z.enum(['quick_sale', 'asset_sale']).default('quick_sale'),
  coin:      z.string().optional(),
})

export async function POST(req: NextRequest) {
  // Autenticação opcional — permite chamada pública para checkout externo
  // mas protege operações internas se session presente
  const session = await getServerSession(authOptions)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { orderId, orderType, coin } = parsed.data

  // Valida moeda suportada
  const payCurrency = (coin && coin in SUPPORTED_COINS ? coin : 'usdttrc20') as SupportedCoin

  // ── Busca e valida a order ────────────────────────────────────────────────
  if (orderType === 'quick_sale') {
    const checkout = await prisma.quickSaleCheckout.findUnique({
      where:  { id: orderId },
      select: {
        id:          true,
        status:      true,
        totalAmount: true,
        buyerName:   true,
        buyerEmail:  true,
        listing: { select: { name: true } },
      },
    })

    if (!checkout) {
      return NextResponse.json({ error: 'Checkout não encontrado' }, { status: 404 })
    }
    if (checkout.status === 'PAID') {
      return NextResponse.json({ error: 'Checkout já foi pago' }, { status: 409 })
    }

    const priceAmount = Number(checkout.totalAmount)

    // ── Cotação cripto em tempo real ────────────────────────────────────────
    const quote = await getKastQuote({
      priceAmount,
      priceCurrency: 'brl',
      coin: payCurrency,
    })

    // ── Cria invoice NOWPayments ────────────────────────────────────────────
    const appUrl    = process.env.NEXTAUTH_URL ?? ''
    const invoice   = await createKastInvoice({
      orderId:       checkout.id,
      priceAmount,
      priceCurrency: 'brl',
      payCurrency,
      description:   `Ads Ativos — ${checkout.listing?.name ?? 'Compra de ativo'}`,
      successUrl:    `${appUrl}/obrigado?id=${checkout.id}&gateway=crypto`,
      cancelUrl:     `${appUrl}/checkout/cripto/${checkout.id}?cancelado=1`,
    })

    // Persiste o invoiceId para rastreio (usando campo pixTxid como fallback)
    await prisma.quickSaleCheckout.update({
      where: { id: checkout.id },
      data:  {
        pixTxid:   invoice.invoiceId,     // reutiliza campo de txid para o invoice cripto
        pixExpiry: invoice.expiresAt ? new Date(invoice.expiresAt) : null,
      },
    }).catch(() => null)

    return NextResponse.json({
      ok:          true,
      invoiceId:   invoice.invoiceId,
      invoiceUrl:  invoice.invoiceUrl,
      payAddress:  invoice.payAddress,
      payAmount:   invoice.payAmount,
      payCurrency: invoice.payCurrency,
      expiresAt:   invoice.expiresAt,
      quote,
      coin: SUPPORTED_COINS[payCurrency],
    })
  }

  // orderType === 'asset_sale'
  const saleOrder = await prisma.assetSalesOrder.findUnique({
    where:  { id: orderId },
    select: { id: true, status: true, totalPrice: true, clientName: true, clientEmail: true },
  })

  if (!saleOrder) {
    return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  }
  if (['PAID', 'DELIVERED', 'COMPLETED'].includes(saleOrder.status)) {
    return NextResponse.json({ error: 'Pedido já está pago' }, { status: 409 })
  }

  const priceAmount = Number(saleOrder.totalPrice)

  const quote = await getKastQuote({ priceAmount, priceCurrency: 'brl', coin: payCurrency })

  const appUrl  = process.env.NEXTAUTH_URL ?? ''
  const invoice = await createKastInvoice({
    orderId:       saleOrder.id,
    priceAmount,
    priceCurrency: 'brl',
    payCurrency,
    description:   `Ads Ativos — Pedido ${saleOrder.id.slice(0, 8)}`,
    successUrl:    `${appUrl}/obrigado?id=${saleOrder.id}&gateway=crypto`,
    cancelUrl:     `${appUrl}/checkout/cripto/${saleOrder.id}?cancelado=1`,
  })

  // Log de auditoria
  if (session?.user) {
    await prisma.auditLog.create({
      data: {
        action:   'CRYPTO_INVOICE_CREATED',
        entity:   'AssetSalesOrder',
        entityId: saleOrder.id,
        userId:   (session.user as { id?: string }).id ?? null,
        details:  { invoiceId: invoice.invoiceId, payCurrency, priceAmount },
      },
    }).catch(() => null)
  }

  return NextResponse.json({
    ok:          true,
    invoiceId:   invoice.invoiceId,
    invoiceUrl:  invoice.invoiceUrl,
    payAddress:  invoice.payAddress,
    payAmount:   invoice.payAmount,
    payCurrency: invoice.payCurrency,
    expiresAt:   invoice.expiresAt,
    quote,
    coin: SUPPORTED_COINS[payCurrency],
  })
}

// ── GET — Consulta cotação sem criar invoice ──────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const amount   = Number(searchParams.get('amount') ?? '0')
  const currency = (searchParams.get('currency') ?? 'brl') as 'brl' | 'usd'
  const coin     = (searchParams.get('coin') ?? 'usdttrc20') as SupportedCoin

  if (amount <= 0) {
    return NextResponse.json({ error: 'amount inválido' }, { status: 400 })
  }

  const quote = await getKastQuote({ priceAmount: amount, priceCurrency: currency, coin })
  return NextResponse.json({ ok: true, quote, coin: SUPPORTED_COINS[coin] })
}
