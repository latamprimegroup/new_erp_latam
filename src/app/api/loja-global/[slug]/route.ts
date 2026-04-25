/**
 * GET  /api/loja-global/[slug] — Info do produto global + status checkout
 * POST /api/loja-global/[slug] — Gera checkout global (Kast ou Mercury)
 * PATCH /api/loja-global/[slug] — Envia dados de entrega AdsPower
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { getServerSession } from 'next-auth/next'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { createKastInvoice } from '@/lib/kast/client'
import { getFxRates } from '@/lib/mercury/client'
import { getPublicAppBaseUrl } from '@/lib/public-app-url'
import {
  checkoutPaymentMethodKey,
  checkoutPaymentPayloadKey,
  listingGlobalGatewaysKey,
  listingPaymentModeKey,
  parseQuickSaleGlobalGateways,
  parseQuickSalePaymentMode,
  quickSaleMercuryRefKey,
  quickSaleOrderLookupKey,
  resolveQuickSalePaymentMethods,
  type QuickSalePaymentMethod,
} from '@/lib/quick-sale-payments'
import { acceptQuickSaleLegalTerms } from '@/lib/smart-delivery-system'

const DELIVERY_FLOW = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  WAITING_CUSTOMER_DATA: 'WAITING_CUSTOMER_DATA',
  DELIVERY_REQUESTED: 'DELIVERY_REQUESTED',
  DELIVERY_IN_PROGRESS: 'DELIVERY_IN_PROGRESS',
  DELIVERED: 'DELIVERED',
} as const

const QUICK_SALE_ORDER_SEQUENCE_KEY = 'quick_sale_order_sequence'
const QUICK_SALE_ORDER_REF_PREFIX = 'quick_sale_order_ref:'
const LISTING_STOCK_QTY_PREFIX = 'quick_sale_listing_stock_qty:'
const MAX_TRANSACTION_RETRIES = 3
const DEFAULT_MERCURY_EXPIRES_HOURS = Number(process.env.QUICK_SALE_MERCURY_EXPIRES_HOURS ?? 24)
const DEFAULT_MERCURY_BANK_NAME = process.env.MERCURY_BANK_NAME ?? 'Mercury Bank'
const DEFAULT_MERCURY_ACCOUNT_NAME = process.env.MERCURY_ACCOUNT_NAME ?? 'Ads Ativos LLC'
const DEFAULT_MERCURY_ROUTING = process.env.MERCURY_ROUTING_NUMBER ?? ''
const DEFAULT_MERCURY_ACCOUNT = process.env.MERCURY_ACCOUNT_NUMBER ?? ''
const DEFAULT_MERCURY_BENEFICIARY_EMAIL = process.env.MERCURY_BENEFICIARY_EMAIL ?? ''

const CPF_REGEX = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/
const CNPJ_REGEX = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/

const checkoutSchema = z.object({
  name: z.string().min(2).max(200),
  cpf: z.string().regex(CPF_REGEX, 'CPF inválido').optional(),
  cnpj: z.string().regex(CNPJ_REGEX, 'CNPJ inválido').optional(),
  whatsapp: z.string().regex(/^\+?55\d{10,11}$/, 'WhatsApp inválido (+5511999999999)'),
  email: z.string().email().optional().or(z.literal('')),
  qty: z.number().int().min(1).max(50),
  paymentMethod: z.enum(['KAST', 'MERCURY']),
  sellerRef: z.string().max(100).optional(),
  utm_source: z.string().max(100).optional(),
  utm_medium: z.string().max(100).optional(),
  utm_campaign: z.string().max(200).optional(),
  utm_content: z.string().max(200).optional(),
  utm_term: z.string().max(200).optional(),
  src: z.string().max(200).optional(),
  utmSrc: z.string().max(200).optional(),
  fbclid: z.string().max(512).optional(),
  gclid: z.string().max(512).optional(),
  referrer: z.string().max(500).optional(),
  acceptTerms: z.boolean().refine((value) => value === true, {
    message: 'É obrigatório aceitar os termos legais para continuar.',
  }),
}).refine((d) => d.cpf || d.cnpj, { message: 'Informe CPF (PF) ou CNPJ (PJ)', path: ['cpf'] })

const deliverySchema = z.object({
  checkoutId: z.string().min(1),
  adspowerEmail: z.string().email('Informe um e-mail AdsPower válido'),
  adspowerProfileReleased: z.boolean(),
})

type ListingLite = {
  id: string
  slug: string
  title: string
  subtitle: string | null
  badge: string | null
  assetCategory: string
  pricePerUnit: Prisma.Decimal
  maxQty: number
  fullDescription: string | null
  stockProductCode: string | null
  stockProductName: string | null
}

function normalizeStockCode(v: string | null | undefined) {
  const normalized = (v ?? '').trim().toUpperCase()
  return normalized || null
}

function normalizeStockName(v: string | null | undefined) {
  const normalized = (v ?? '').trim()
  return normalized || null
}

function normalizeEmail(v: string) {
  return v.trim().toLowerCase()
}

function isMissingColumnError(err: unknown) {
  if (!err || typeof err !== 'object') return false
  const code = (err as { code?: string }).code
  const msg = String((err as { message?: string }).message ?? '')
  return code === 'P2022' || msg.includes('Unknown column')
}

function isRetryableTransactionError(err: unknown) {
  if (!err || typeof err !== 'object') return false
  const code = (err as { code?: string }).code
  const msg = String((err as { message?: string }).message ?? '').toLowerCase()
  return code === 'P2034' || msg.includes('could not serialize') || msg.includes('serialization')
}

function parseSequenceValue(value: string | null | undefined) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

function formatQuickSaleOrderNumber(sequence: number) {
  return `VR-${String(sequence).padStart(6, '0')}`
}

function listingStockQtyKey(listingId: string) {
  return `${LISTING_STOCK_QTY_PREFIX}${listingId}`
}

function quickSaleOrderRefKey(checkoutId: string) {
  return `${QUICK_SALE_ORDER_REF_PREFIX}${checkoutId}`
}

function buildMercuryReference(orderNumber: string, checkoutId: string) {
  const safeOrder = orderNumber.replace(/[^A-Z0-9\-]/gi, '').toUpperCase()
  const suffix = checkoutId.slice(-6).toUpperCase()
  return `${safeOrder}-${suffix}`
}

function buildMercuryTransferInstructions(input: {
  amountUsd: number
  amountBrl: number
  orderNumber: string
  reference: string
}) {
  return {
    bankName: DEFAULT_MERCURY_BANK_NAME,
    accountName: DEFAULT_MERCURY_ACCOUNT_NAME,
    routingNumber: DEFAULT_MERCURY_ROUTING,
    accountNumber: DEFAULT_MERCURY_ACCOUNT,
    beneficiaryEmail: DEFAULT_MERCURY_BENEFICIARY_EMAIL || null,
    amountUsd: Math.max(0, Math.round(input.amountUsd * 100) / 100),
    amountBrlEstimate: Math.max(0, Math.round(input.amountBrl * 100) / 100),
    reference: input.reference,
    note: `Use a referência ${input.reference} para conciliar o pedido ${input.orderNumber}.`,
  }
}

async function getListingBySlug(slug: string): Promise<ListingLite | null> {
  const base = await prisma.productListing.findFirst({
    where: { slug, active: true },
    select: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      badge: true,
      assetCategory: true,
      pricePerUnit: true,
      maxQty: true,
    },
  })
  if (!base) return null
  try {
    const extended = await prisma.productListing.findUnique({
      where: { id: base.id },
      select: {
        fullDescription: true,
        stockProductCode: true,
        stockProductName: true,
      },
    })
    return {
      ...base,
      fullDescription: extended?.fullDescription ?? null,
      stockProductCode: extended?.stockProductCode ?? null,
      stockProductName: extended?.stockProductName ?? null,
    }
  } catch (err) {
    if (!isMissingColumnError(err)) throw err
    return {
      ...base,
      fullDescription: null,
      stockProductCode: null,
      stockProductName: null,
    }
  }
}

async function getListingStockQtyConfigured(listingId: string) {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: listingStockQtyKey(listingId) },
    select: { value: true },
  })
  if (!setting?.value) return null
  const qty = Number.parseInt(String(setting.value).trim(), 10)
  if (!Number.isFinite(qty) || qty <= 0) return null
  return qty
}

async function getListingStockQtyRemaining(listingId: string) {
  const configured = await getListingStockQtyConfigured(listingId)
  if (configured == null) return null
  const reserved = await prisma.quickSaleCheckout.aggregate({
    where: { listingId, status: { in: ['PENDING', 'PAID'] } },
    _sum: { qty: true },
  })
  const used = Number(reserved._sum.qty ?? 0)
  return Math.max(0, configured - used)
}

async function countAvailableAssetsWithFallback(listing: { assetCategory: string }) {
  try {
    return await prisma.asset.count({
      where: {
        category: listing.assetCategory as never,
        status: 'AVAILABLE',
      },
    })
  } catch (err) {
    console.error('[Loja Global GET] Falha no count por categoria:', err)
    return 0
  }
}

function buildAssetWhere(listing: {
  assetCategory: string
  stockProductCode: string | null
  stockProductName: string | null
}) {
  const code = normalizeStockCode(listing.stockProductCode)
  const name = normalizeStockName(listing.stockProductName)
  const base = {
    category: listing.assetCategory as never,
    status: 'AVAILABLE' as const,
  }
  if (code) {
    return {
      ...base,
      OR: [
        { adsId: code },
        { specs: { path: '$.productCode', equals: code } },
        { specs: { path: '$.codigoProduto', equals: code } },
      ],
    }
  }
  if (name) {
    return {
      ...base,
      OR: [
        { displayName: { equals: name, mode: 'insensitive' as const } },
        { subCategory: { equals: name, mode: 'insensitive' as const } },
        { specs: { path: '$.productName', equals: name } },
        { specs: { path: '$.nomeProduto', equals: name } },
      ],
    }
  }
  return base
}

async function resolveListingPaymentConfig(listingId: string) {
  const [modeSetting, gatewaysSetting] = await Promise.all([
    prisma.systemSetting.findUnique({
      where: { key: listingPaymentModeKey(listingId) },
      select: { value: true },
    }),
    prisma.systemSetting.findUnique({
      where: { key: listingGlobalGatewaysKey(listingId) },
      select: { value: true },
    }),
  ])
  const paymentMode = parseQuickSalePaymentMode(modeSetting?.value)
  const globalGateways = parseQuickSaleGlobalGateways(gatewaysSetting?.value)
  const paymentMethods = resolveQuickSalePaymentMethods(paymentMode, globalGateways)
  return { paymentMode, globalGateways, paymentMethods }
}

async function reserveNextQuickSaleOrderNumber(tx: Prisma.TransactionClient) {
  const sequenceSetting = await tx.systemSetting.findUnique({
    where: { key: QUICK_SALE_ORDER_SEQUENCE_KEY },
    select: { id: true, value: true },
  })
  if (!sequenceSetting) throw new Error('QUICK_SALE_SEQUENCE_NOT_INITIALIZED')
  const nextSequence = parseSequenceValue(sequenceSetting.value) + 1
  await tx.systemSetting.update({
    where: { id: sequenceSetting.id },
    data: { value: String(nextSequence) },
  })
  return {
    sequence: nextSequence,
    orderNumber: formatQuickSaleOrderNumber(nextSequence),
  }
}

async function createQuickCheckoutWithFallback(
  tx: Prisma.TransactionClient,
  data: Prisma.QuickSaleCheckoutUncheckedCreateInput,
) {
  const attempts: Prisma.QuickSaleCheckoutUncheckedCreateInput[] = [
    {
      ...data,
      deliveryFlowStatus: DELIVERY_FLOW.PENDING_PAYMENT,
      deliveryStatusNote: 'Aguardando pagamento para liberar etapa de entrega.',
    },
    data,
  ]
  let lastErr: unknown
  for (const payload of attempts) {
    try {
      return await tx.quickSaleCheckout.create({ data: payload })
    } catch (err) {
      if (!isMissingColumnError(err)) throw err
      lastErr = err
    }
  }
  if (lastErr) throw lastErr
  throw new Error('Falha ao criar checkout global')
}

async function getQuickSaleOrderNumber(checkoutId: string) {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: quickSaleOrderRefKey(checkoutId) },
    select: { value: true },
  })
  const orderNumber = setting?.value?.trim()
  return orderNumber || null
}

async function getCheckoutPaymentMeta(checkoutId: string) {
  const settings = await prisma.systemSetting.findMany({
    where: {
      key: { in: [checkoutPaymentMethodKey(checkoutId), checkoutPaymentPayloadKey(checkoutId)] },
    },
    select: { key: true, value: true },
  })
  let paymentMethod: QuickSalePaymentMethod = 'PIX'
  let paymentPayload: Record<string, unknown> | null = null
  for (const setting of settings) {
    if (setting.key === checkoutPaymentMethodKey(checkoutId)) {
      const raw = String(setting.value ?? '').trim().toUpperCase()
      if (raw === 'KAST' || raw === 'MERCURY' || raw === 'PIX') {
        paymentMethod = raw as QuickSalePaymentMethod
      }
    }
    if (setting.key === checkoutPaymentPayloadKey(checkoutId) && setting.value) {
      try {
        const parsed = JSON.parse(setting.value) as unknown
        if (parsed && typeof parsed === 'object') {
          paymentPayload = parsed as Record<string, unknown>
        }
      } catch {
        paymentPayload = null
      }
    }
  }
  return { paymentMethod, paymentPayload }
}

export async function GET(req: globalThis.Request, { params }: { params: { slug: string } }) {
  try {
    const { searchParams } = new URL(req.url)
    const checkoutId = searchParams.get('checkoutId')
    if (checkoutId) {
      let checkout: {
        id: string
        status: string
        paidAt: Date | null
        expiresAt: Date | null
        totalAmount: Prisma.Decimal
        qty: number
        updatedAt: Date
        deliveryFlowStatus: string
        adspowerEmail: string | null
        adspowerProfileReleased: boolean
        deliveryRequestedAt: Date | null
        deliveryStatusNote: string | null
        deliverySent: boolean
        listing: { slug: string; title: string }
      } | null = null
      try {
        checkout = await prisma.quickSaleCheckout.findUnique({
          where: { id: checkoutId },
          select: {
            id: true,
            status: true,
            paidAt: true,
            expiresAt: true,
            totalAmount: true,
            qty: true,
            updatedAt: true,
            deliveryFlowStatus: true,
            adspowerEmail: true,
            adspowerProfileReleased: true,
            deliveryRequestedAt: true,
            deliveryStatusNote: true,
            deliverySent: true,
            listing: { select: { slug: true, title: true } },
          },
        }) as typeof checkout
      } catch (err) {
        if (!isMissingColumnError(err)) throw err
        const legacy = await prisma.quickSaleCheckout.findUnique({
          where: { id: checkoutId },
          select: {
            id: true,
            status: true,
            paidAt: true,
            expiresAt: true,
            totalAmount: true,
            qty: true,
            updatedAt: true,
            listing: { select: { slug: true, title: true } },
          },
        })
        checkout = legacy
          ? {
              ...legacy,
              deliveryFlowStatus: legacy.status === 'PAID' ? DELIVERY_FLOW.WAITING_CUSTOMER_DATA : DELIVERY_FLOW.PENDING_PAYMENT,
              adspowerEmail: null,
              adspowerProfileReleased: false,
              deliveryRequestedAt: null,
              deliveryStatusNote: null,
              deliverySent: false,
            }
          : null
      }
      if (!checkout) return NextResponse.json({ error: 'Checkout não encontrado' }, { status: 404 })
      if (checkout.listing.slug !== params.slug) {
        return NextResponse.json({ error: 'Checkout não pertence a este produto' }, { status: 404 })
      }
      const orderNumber = await getQuickSaleOrderNumber(checkout.id).catch(() => null)
      const paymentMeta = await getCheckoutPaymentMeta(checkout.id).catch(() => ({ paymentMethod: 'PIX' as QuickSalePaymentMethod, paymentPayload: null }))
      return NextResponse.json({
        status: checkout.status,
        paidAt: checkout.paidAt,
        expiresAt: checkout.expiresAt,
        totalAmount: Number(checkout.totalAmount),
        qty: checkout.qty,
        title: checkout.listing.title,
        orderNumber,
        updatedAt: checkout.updatedAt,
        paymentMethod: paymentMeta.paymentMethod,
        paymentPayload: paymentMeta.paymentPayload,
        delivery: {
          flowStatus: checkout.deliveryFlowStatus,
          adspowerEmail: checkout.adspowerEmail,
          adspowerProfileReleased: checkout.adspowerProfileReleased,
          deliveryRequestedAt: checkout.deliveryRequestedAt,
          deliveryStatusNote: checkout.deliveryStatusNote,
          deliverySent: checkout.deliverySent,
        },
      })
    }

    const listing = await getListingBySlug(params.slug)
    if (!listing) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })
    const paymentConfig = await resolveListingPaymentConfig(listing.id)
    if (paymentConfig.paymentMode !== 'GLOBAL') {
      return NextResponse.json({ error: 'Este link não está configurado como Venda Rápida Global.' }, { status: 409 })
    }

    const stockQtyRemaining = await getListingStockQtyRemaining(listing.id)
    const availableByAssets = await countAvailableAssetsWithFallback(listing)
    const available = stockQtyRemaining == null ? availableByAssets : Math.min(availableByAssets, stockQtyRemaining)

    return NextResponse.json({
      id: listing.id,
      slug: listing.slug,
      title: listing.title,
      subtitle: listing.subtitle,
      fullDescription: listing.fullDescription,
      badge: listing.badge,
      stockProductCode: listing.stockProductCode,
      stockProductName: listing.stockProductName,
      pricePerUnit: Number(listing.pricePerUnit),
      maxQty: Math.min(listing.maxQty, available),
      available,
      paymentMode: paymentConfig.paymentMode,
      globalGateways: paymentConfig.globalGateways,
      paymentMethods: paymentConfig.paymentMethods.filter((m) => m !== 'PIX'),
    })
  } catch (err) {
    console.error('[Loja Global GET] erro inesperado:', err)
    return NextResponse.json({ error: 'Erro ao carregar produto. Tente novamente.' }, { status: 500 })
  }
}

export async function POST(req: globalThis.Request, { params }: { params: { slug: string } }) {
  const listing = await getListingBySlug(params.slug)
  if (!listing) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })
  const paymentConfig = await resolveListingPaymentConfig(listing.id)
  if (paymentConfig.paymentMode !== 'GLOBAL') {
    return NextResponse.json({ error: 'Este link não está configurado como Venda Rápida Global.' }, { status: 409 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const parsed = checkoutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })
  }

  const {
    name,
    cpf,
    cnpj,
    whatsapp,
    email,
    qty,
    paymentMethod,
    sellerRef,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    src,
    utmSrc,
    fbclid,
    gclid,
    referrer,
    acceptTerms,
  } = parsed.data
  if (!acceptTerms) {
    return NextResponse.json({
      error: 'É obrigatório aceitar os termos legais para continuar.',
    }, { status: 422 })
  }

  if (!paymentConfig.paymentMethods.includes(paymentMethod)) {
    return NextResponse.json({ error: 'Forma de pagamento não habilitada para este link global.' }, { status: 409 })
  }

  const waE164 = whatsapp.startsWith('+') ? whatsapp : `+${whatsapp}`
  const cpfClean = cpf?.replace(/\D/g, '') ?? ''
  const cnpjClean = cnpj?.replace(/\D/g, '') ?? ''
  const buyerDoc = cnpjClean.length === 14 ? cnpjClean : cpfClean

  const session = await getServerSession(authOptions).catch(() => null)
  let checkoutSellerId: string | null =
    session?.user?.role === 'COMMERCIAL' || session?.user?.role === 'ADMIN'
      ? session.user.id
      : null
  const checkoutManagerId =
    session?.user?.role === 'COMMERCIAL' ? session.user.leaderId ?? null : null
  if (!checkoutSellerId && sellerRef) {
    const sellerUser = await prisma.user.findFirst({
      where: { id: sellerRef, role: { in: ['COMMERCIAL', 'ADMIN'] } },
      select: { id: true },
    }).catch(() => null)
    if (sellerUser) checkoutSellerId = sellerUser.id
  }

  const listingStockRemaining = await getListingStockQtyRemaining(listing.id)
  if (listingStockRemaining != null && listingStockRemaining < qty) {
    return NextResponse.json({
      error: `Estoque configurado insuficiente para este link. Restante: ${listingStockRemaining} unidade(s).`,
    }, { status: 409 })
  }

  const totalAmount = Number(listing.pricePerUnit) * qty
  const pendingExpiresAt = paymentMethod === 'KAST'
    ? new Date(Date.now() + 30 * 60 * 1000)
    : new Date(Date.now() + Math.max(1, DEFAULT_MERCURY_EXPIRES_HOURS) * 60 * 60 * 1000)

  let checkout: Awaited<ReturnType<typeof prisma.quickSaleCheckout.create>>
  let orderNumber: string
  try {
    await prisma.systemSetting.upsert({
      where: { key: QUICK_SALE_ORDER_SEQUENCE_KEY },
      create: { key: QUICK_SALE_ORDER_SEQUENCE_KEY, value: '0' },
      update: {},
    })

    let txResult: { checkout: Awaited<ReturnType<typeof prisma.quickSaleCheckout.create>>; orderNumber: string } | null = null
    for (let attempt = 1; attempt <= MAX_TRANSACTION_RETRIES; attempt += 1) {
      try {
        txResult = await prisma.$transaction(async (tx) => {
          const candidates = await tx.asset.findMany({
            where: buildAssetWhere(listing),
            select: { id: true },
            take: qty,
            orderBy: { createdAt: 'asc' },
          })
          if (candidates.length < qty) {
            throw new Error(`STOCK_INSUFFICIENT:${candidates.length}`)
          }
          const assetIds = candidates.map((a) => a.id)
          const { count } = await tx.asset.updateMany({
            where: { id: { in: assetIds }, status: 'AVAILABLE' },
            data: { status: 'QUARANTINE' },
          })
          if (count < qty) throw new Error(`STOCK_RACE:${count}`)

          const nextOrder = await reserveNextQuickSaleOrderNumber(tx)
          const createdCheckout = await createQuickCheckoutWithFallback(tx, {
            listingId: listing.id,
            buyerName: name,
            buyerCpf: buyerDoc,
            buyerWhatsapp: waE164,
            buyerEmail: email || null,
            qty,
            stockProductCodeSnapshot: normalizeStockCode(listing.stockProductCode),
            stockProductNameSnapshot: normalizeStockName(listing.stockProductName),
            totalAmount,
            status: 'PENDING',
            interTxid: `GLOB-${paymentMethod}-${randomUUID().replace(/-/g, '').slice(0, 22)}`,
            pixCopyPaste: null,
            pixQrCode: null,
            expiresAt: pendingExpiresAt,
            reservedAssetIds: assetIds,
            sellerId: checkoutSellerId,
            managerId: checkoutManagerId,
            utmSource: utm_source ?? null,
            utmMedium: utm_medium ?? null,
            utmCampaign: utm_campaign ?? null,
            utmContent: utm_content ?? null,
            utmTerm: utm_term ?? null,
            utmSrc: src ?? utmSrc ?? null,
            fbclid: fbclid ?? null,
            gclid: gclid ?? null,
            referrer: referrer ?? null,
          })

          await tx.systemSetting.upsert({
            where: { key: quickSaleOrderRefKey(createdCheckout.id) },
            create: { key: quickSaleOrderRefKey(createdCheckout.id), value: nextOrder.orderNumber },
            update: { value: nextOrder.orderNumber },
          })
          await tx.systemSetting.upsert({
            where: { key: quickSaleOrderLookupKey(nextOrder.orderNumber) },
            create: { key: quickSaleOrderLookupKey(nextOrder.orderNumber), value: createdCheckout.id },
            update: { value: createdCheckout.id },
          })
          await tx.systemSetting.upsert({
            where: { key: checkoutPaymentMethodKey(createdCheckout.id) },
            create: { key: checkoutPaymentMethodKey(createdCheckout.id), value: paymentMethod },
            update: { value: paymentMethod },
          })

          return { checkout: createdCheckout, orderNumber: nextOrder.orderNumber }
        }, { isolationLevel: 'Serializable' })
        break
      } catch (err) {
        if (attempt < MAX_TRANSACTION_RETRIES && isRetryableTransactionError(err)) continue
        throw err
      }
    }

    if (!txResult) throw new Error('TRANSACTION_FAILED')
    checkout = txResult.checkout
    orderNumber = txResult.orderNumber
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.startsWith('STOCK_INSUFFICIENT') || msg.startsWith('STOCK_RACE')) {
      const avail = msg.split(':')[1] ?? '0'
      return NextResponse.json({
        error: `Estoque insuficiente. Disponível: ${avail} unidade(s). Reduza a quantidade ou tente novamente.`,
      }, { status: 409 })
    }
    console.error('[Loja Global reserve]', err)
    return NextResponse.json({ error: 'Erro interno ao reservar estoque.' }, { status: 500 })
  }

  const baseUrl = getPublicAppBaseUrl() || new URL(req.url).origin
  const resumeUrl = `${baseUrl}/loja-global/${listing.slug}?checkoutId=${encodeURIComponent(checkout.id)}`

  try {
    if (paymentMethod === 'KAST') {
      const invoice = await createKastInvoice({
        orderId: checkout.id,
        priceAmount: totalAmount,
        priceCurrency: 'brl',
        description: `Ads Ativos Global — ${listing.title}`,
        successUrl: resumeUrl,
        cancelUrl: resumeUrl,
      })
      const payload = {
        invoiceId: invoice.invoiceId,
        invoiceUrl: invoice.invoiceUrl,
        payAddress: invoice.payAddress,
        payAmount: invoice.payAmount,
        payCurrency: invoice.payCurrency,
        expiresAt: invoice.expiresAt,
      }
      await prisma.systemSetting.upsert({
        where: { key: checkoutPaymentPayloadKey(checkout.id) },
        create: { key: checkoutPaymentPayloadKey(checkout.id), value: JSON.stringify(payload) },
        update: { value: JSON.stringify(payload) },
      })
      if (invoice.expiresAt) {
        await prisma.quickSaleCheckout.update({
          where: { id: checkout.id },
          data: { expiresAt: new Date(invoice.expiresAt) },
        }).catch(() => null)
      }
      await acceptQuickSaleLegalTerms(checkout.id, {
        buyerName: name,
        buyerDocument: buyerDoc,
        buyerEmail: email || null,
        buyerWhatsapp: waE164,
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
        userAgent: req.headers.get('user-agent') ?? null,
      }).catch((e) => console.error('[Loja Global] Falha ao registrar aceite legal:', e))

      return NextResponse.json({
        checkoutId: checkout.id,
        orderNumber,
        paymentMethod,
        paymentPayload: payload,
        totalAmount,
        qty,
        title: listing.title,
        resumeUrl,
      }, { status: 201 })
    }

    const fx = await getFxRates().catch(() => ({ rates: { BRL: 5.2 } as Record<string, number> }))
    const brlRate = fx.rates?.BRL ?? 5.2
    const amountUsd = totalAmount / brlRate
    const reference = buildMercuryReference(orderNumber, checkout.id)
    const payload = {
      reference,
      expiresAt: pendingExpiresAt.toISOString(),
      instructions: buildMercuryTransferInstructions({
        amountUsd,
        amountBrl: totalAmount,
        orderNumber,
        reference,
      }),
    }
    await prisma.systemSetting.upsert({
      where: { key: quickSaleMercuryRefKey(reference) },
      create: { key: quickSaleMercuryRefKey(reference), value: checkout.id },
      update: { value: checkout.id },
    })
    await prisma.systemSetting.upsert({
      where: { key: checkoutPaymentPayloadKey(checkout.id) },
      create: { key: checkoutPaymentPayloadKey(checkout.id), value: JSON.stringify(payload) },
      update: { value: JSON.stringify(payload) },
    })
    await acceptQuickSaleLegalTerms(checkout.id, {
      buyerName: name,
      buyerDocument: buyerDoc,
      buyerEmail: email || null,
      buyerWhatsapp: waE164,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: req.headers.get('user-agent') ?? null,
    }).catch((e) => console.error('[Loja Global] Falha ao registrar aceite legal:', e))

    return NextResponse.json({
      checkoutId: checkout.id,
      orderNumber,
      paymentMethod,
      paymentPayload: payload,
      totalAmount,
      qty,
      title: listing.title,
      resumeUrl,
    }, { status: 201 })
  } catch (err) {
    console.error('[Loja Global payment setup]', err)
    const reservedIds = (checkout.reservedAssetIds as string[] | null) ?? []
    await prisma.$transaction([
      prisma.asset.updateMany({
        where: { id: { in: reservedIds }, status: 'QUARANTINE' },
        data: { status: 'AVAILABLE' },
      }),
      prisma.quickSaleCheckout.update({
        where: { id: checkout.id },
        data: { status: 'CANCELLED', deliveryStatusNote: 'Falha ao configurar pagamento global.' },
      }),
    ]).catch((releaseErr) => console.error('[Loja Global rollback]', releaseErr))
    return NextResponse.json({ error: 'Falha ao configurar pagamento global. Tente novamente.' }, { status: 502 })
  }
}

export async function PATCH(req: globalThis.Request, { params }: { params: { slug: string } }) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const parsed = deliverySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })
  }
  const { checkoutId, adspowerEmail, adspowerProfileReleased } = parsed.data
  if (!adspowerProfileReleased) {
    return NextResponse.json({
      error: 'É obrigatório confirmar que o perfil AdsPower está liberado para enviar a entrega.',
    }, { status: 422 })
  }

  let checkout: {
    id: string
    status: string
    listing: { slug: string }
    deliveryFlowStatus: string
  } | null = null
  try {
    checkout = await prisma.quickSaleCheckout.findUnique({
      where: { id: checkoutId },
      select: {
        id: true,
        status: true,
        listing: { select: { slug: true } },
        deliveryFlowStatus: true,
      },
    }) as typeof checkout
  } catch (err) {
    if (!isMissingColumnError(err)) throw err
    const legacy = await prisma.quickSaleCheckout.findUnique({
      where: { id: checkoutId },
      select: {
        id: true,
        status: true,
        listing: { select: { slug: true } },
      },
    })
    checkout = legacy
      ? {
          ...legacy,
          deliveryFlowStatus: legacy.status === 'PAID' ? DELIVERY_FLOW.WAITING_CUSTOMER_DATA : DELIVERY_FLOW.PENDING_PAYMENT,
        }
      : null
  }
  if (!checkout) return NextResponse.json({ error: 'Checkout não encontrado' }, { status: 404 })
  if (checkout.listing.slug !== params.slug) {
    return NextResponse.json({ error: 'Checkout não pertence a este produto' }, { status: 404 })
  }
  if (checkout.status !== 'PAID') {
    return NextResponse.json({ error: 'A entrega só pode ser enviada após confirmação do pagamento.' }, { status: 409 })
  }

  const nextFlow =
    checkout.deliveryFlowStatus === DELIVERY_FLOW.DELIVERED
      ? DELIVERY_FLOW.DELIVERED
      : checkout.deliveryFlowStatus === DELIVERY_FLOW.DELIVERY_IN_PROGRESS
        ? DELIVERY_FLOW.DELIVERY_IN_PROGRESS
        : DELIVERY_FLOW.DELIVERY_REQUESTED

  let updated: {
    id: string
    deliveryFlowStatus: string
    adspowerEmail: string | null
    adspowerProfileReleased: boolean
    deliveryRequestedAt: Date | null
    deliveryStatusNote: string | null
    deliverySent: boolean
  }
  try {
    updated = await prisma.quickSaleCheckout.update({
      where: { id: checkout.id },
      data: {
        adspowerEmail: normalizeEmail(adspowerEmail),
        adspowerProfileReleased: true,
        deliveryRequestedAt: new Date(),
        deliveryFlowStatus: nextFlow,
        deliveryStatusNote: 'Dados de entrega recebidos. Equipe Ads Ativos validando e separando acesso.',
      },
      select: {
        id: true,
        deliveryFlowStatus: true,
        adspowerEmail: true,
        adspowerProfileReleased: true,
        deliveryRequestedAt: true,
        deliveryStatusNote: true,
        deliverySent: true,
      },
    })
  } catch (err) {
    if (!isMissingColumnError(err)) throw err
    return NextResponse.json({
      error: 'Módulo de entrega em atualização. Tente novamente em instantes.',
    }, { status: 503 })
  }

  return NextResponse.json({
    ok: true,
    checkoutId: updated.id,
    delivery: {
      flowStatus: updated.deliveryFlowStatus,
      adspowerEmail: updated.adspowerEmail,
      adspowerProfileReleased: updated.adspowerProfileReleased,
      deliveryRequestedAt: updated.deliveryRequestedAt,
      deliveryStatusNote: updated.deliveryStatusNote,
      deliverySent: updated.deliverySent,
    },
  })
}
