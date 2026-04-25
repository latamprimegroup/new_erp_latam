/**
 * GET  /api/loja/[slug] — Info do produto (público, sem autenticação)
 * POST /api/loja/[slug] — Gera checkout PIX para o listing
 */
import { NextResponse } from 'next/server'
import { z }           from 'zod'
import { randomUUID }  from 'crypto'
import { getServerSession } from 'next-auth/next'
import { prisma }      from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import type { Prisma } from '@prisma/client'
import { generatePixCharge, InterApiError } from '@/lib/inter/client'
import { sendUtmifyPixGerado } from '@/lib/utmify'
import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'
import { getPublicAppBaseUrl } from '@/lib/public-app-url'

const DELIVERY_FLOW = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  WAITING_CUSTOMER_DATA: 'WAITING_CUSTOMER_DATA',
  DELIVERY_REQUESTED: 'DELIVERY_REQUESTED',
  DELIVERY_IN_PROGRESS: 'DELIVERY_IN_PROGRESS',
  DELIVERED: 'DELIVERED',
} as const

const QUICK_SALE_ORDER_SEQUENCE_KEY = 'quick_sale_order_sequence'
const QUICK_SALE_ORDER_REF_PREFIX = 'quick_sale_order_ref:'
const REUSABLE_PENDING_PIX_BUFFER_MS = 30_000
const MAX_TRANSACTION_RETRIES = 3

function normalizeStockCode(v: string | null | undefined) {
  const normalized = (v ?? '').trim().toUpperCase()
  return normalized || null
}

function normalizeStockName(v: string | null | undefined) {
  const normalized = (v ?? '').trim()
  return normalized || null
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

function mapInterPixErrorCode(err: unknown): string {
  if (!(err instanceof InterApiError)) return 'PIX_PROVIDER_UNAVAILABLE'
  const body = String(err.body || '').toLowerCase()
  const endpoint = String(err.endpoint || '').toLowerCase()
  if (body.includes('client id/secret') || body.includes('inter_client_id') || body.includes('banco_inter_client_id')) {
    return 'INTER_CREDENTIALS_INVALID_OR_MISSING'
  }
  if (body.includes('certificado mtls') || body.includes('inter_cert') || body.includes('banco_inter_cert')) {
    return 'INTER_MTLS_CERT_MISSING_OR_INVALID'
  }
  if (body.includes('número da conta') || body.includes('inter_account')) {
    return 'INTER_ACCOUNT_NUMBER_MISSING_OR_INVALID'
  }
  if (body.includes('chave pix') || body.includes('inter_pix_key') || body.includes('banco_inter_pix_key')) {
    return 'INTER_PIX_KEY_MISSING_OR_INVALID'
  }
  if (endpoint.includes('/oauth/v2/token')) {
    return 'INTER_OAUTH_TOKEN_ERROR'
  }
  if (endpoint.includes('/pix/v2/cob') || endpoint.includes('/pix/v2/webhook')) {
    return 'INTER_PIX_API_ERROR'
  }
  if (err.statusCode === 401 || err.statusCode === 403) {
    return 'INTER_AUTH_FAILED'
  }
  return 'INTER_API_ERROR'
}

function parseSequenceValue(value: string | null | undefined) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

function formatQuickSaleOrderNumber(sequence: number) {
  return `VR-${String(sequence).padStart(6, '0')}`
}

function getQuickSaleOrderRefKey(checkoutId: string) {
  return `${QUICK_SALE_ORDER_REF_PREFIX}${checkoutId}`
}

async function reserveNextQuickSaleOrderNumber(tx: Prisma.TransactionClient) {
  const sequenceSetting = await tx.systemSetting.findUnique({
    where: { key: QUICK_SALE_ORDER_SEQUENCE_KEY },
    select: { id: true, value: true },
  })
  if (!sequenceSetting) {
    throw new Error('QUICK_SALE_SEQUENCE_NOT_INITIALIZED')
  }

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

async function attachQuickSaleOrderNumber(
  tx: Prisma.TransactionClient,
  checkoutId: string,
  orderNumber: string,
) {
  await tx.systemSetting.upsert({
    where: { key: getQuickSaleOrderRefKey(checkoutId) },
    create: {
      key: getQuickSaleOrderRefKey(checkoutId),
      value: orderNumber,
    },
    update: { value: orderNumber },
  })
}

async function getQuickSaleOrderNumber(checkoutId: string) {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: getQuickSaleOrderRefKey(checkoutId) },
    select: { value: true },
  })
  const orderNumber = setting?.value?.trim()
  return orderNumber ? orderNumber : null
}

async function getReusablePendingCheckout(input: {
  listingId: string
  buyerDoc: string
  buyerWhatsapp: string
  qty: number
}) {
  return prisma.quickSaleCheckout.findFirst({
    where: {
      listingId: input.listingId,
      buyerCpf: input.buyerDoc,
      buyerWhatsapp: input.buyerWhatsapp,
      qty: input.qty,
      status: 'PENDING',
      expiresAt: { gt: new Date(Date.now() + REUSABLE_PENDING_PIX_BUFFER_MS) },
      pixCopyPaste: { not: null },
      pixQrCode: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      listing: { select: { slug: true, title: true } },
      pixCopyPaste: true,
      pixQrCode: true,
      expiresAt: true,
      totalAmount: true,
      qty: true,
    },
  })
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

async function countAvailableAssetsWithFallback(listing: {
  assetCategory: string
}) {
  const byCategory = {
    category: listing.assetCategory as never,
    status: 'AVAILABLE' as const,
  }

  try {
    return await prisma.asset.count({ where: byCategory })
  } catch (err) {
    console.error('[Loja GET] Falha no count por categoria:', err)
    return 0
  }
}

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

async function createQuickCheckoutWithFallback(
  tx: Prisma.TransactionClient,
  data: {
    listingId: string
    buyerName: string
    buyerCpf: string
    buyerWhatsapp: string
    buyerEmail: string | null
    qty: number
    stockProductCodeSnapshot: string | null
    stockProductNameSnapshot: string | null
    totalAmount: number
    status: 'PENDING'
    interTxid: string
    pixCopyPaste: string
    pixQrCode: string
    expiresAt: Date
    reservedAssetIds: string[]
    sellerId: string | null
    managerId: string | null
    utmSource: string | null
    utmMedium: string | null
    utmCampaign: string | null
    utmContent: string | null
    utmTerm: string | null
    utmSrc: string | null
    fbclid: string | null
    gclid: string | null
    referrer: string | null
  },
) {
  type QuickSaleCreateInput = Prisma.QuickSaleCheckoutUncheckedCreateInput
  const {
    stockProductCodeSnapshot,
    stockProductNameSnapshot,
    ...withoutSnapshots
  } = data

  const attempts: QuickSaleCreateInput[] = [
    {
      ...data,
      deliveryFlowStatus: DELIVERY_FLOW.PENDING_PAYMENT,
      deliveryStatusNote: 'Aguardando pagamento PIX para liberar etapa de entrega.',
    },
    data,
    {
      ...withoutSnapshots,
      deliveryFlowStatus: DELIVERY_FLOW.PENDING_PAYMENT,
      deliveryStatusNote: 'Aguardando pagamento PIX para liberar etapa de entrega.',
    },
    withoutSnapshots,
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

  if (lastErr) {
    throw lastErr
  }

  throw new Error('Falha ao criar checkout de Venda Rápida')
}

// ─── GET: retorna info do produto OU status do checkout ───────────────────────

export async function GET(req: globalThis.Request, { params }: { params: { slug: string } }) {
  try {
    const { searchParams } = new URL(req.url)
    const checkoutId = searchParams.get('checkoutId')

    // Polling de status do checkout
    if (checkoutId) {
      let co: {
        status: string
        paidAt: Date | null
        expiresAt: Date | null
        pixCopyPaste: string | null
        pixQrCode: string | null
        totalAmount: Prisma.Decimal
        qty: number
        updatedAt: Date
        listing: { slug: string; title: string }
        deliveryFlowStatus: string
        adspowerEmail: string | null
        adspowerProfileReleased: boolean
        deliveryRequestedAt: Date | null
        deliveryStatusNote: string | null
        deliverySent: boolean
      } | null = null
      try {
        co = await prisma.quickSaleCheckout.findUnique({
          where: { id: checkoutId },
          select: {
            status: true,
            paidAt: true,
            expiresAt: true,
            pixCopyPaste: true,
            pixQrCode: true,
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
        }) as typeof co
      } catch (err) {
        if (!isMissingColumnError(err)) throw err
        const legacy = await prisma.quickSaleCheckout.findUnique({
          where: { id: checkoutId },
          select: {
            status: true,
            paidAt: true,
            expiresAt: true,
            pixCopyPaste: true,
            pixQrCode: true,
            totalAmount: true,
            qty: true,
            updatedAt: true,
            listing: { select: { slug: true, title: true } },
          },
        })
        co = legacy
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
      if (!co) return NextResponse.json({ error: 'Checkout não encontrado' }, { status: 404 })
      if (co.listing.slug !== params.slug) {
        return NextResponse.json({ error: 'Checkout não pertence a este produto' }, { status: 404 })
      }
      const orderNumber = await getQuickSaleOrderNumber(checkoutId).catch(() => null)
      return NextResponse.json({
        status: co.status,
        paidAt: co.paidAt,
        expiresAt: co.expiresAt,
        pixCopyPaste: co.pixCopyPaste,
        qrCodeBase64: co.pixQrCode,
        totalAmount: Number(co.totalAmount),
        qty: co.qty,
        title: co.listing.title,
        orderNumber,
        updatedAt: co.updatedAt,
        delivery: {
          flowStatus: co.deliveryFlowStatus,
          adspowerEmail: co.adspowerEmail,
          adspowerProfileReleased: co.adspowerProfileReleased,
          deliveryRequestedAt: co.deliveryRequestedAt,
          deliveryStatusNote: co.deliveryStatusNote,
          deliverySent: co.deliverySent,
        },
      })
    }

    const listing = await getListingBySlug(params.slug)
    if (!listing) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })

    const available = await countAvailableAssetsWithFallback(listing)

    return NextResponse.json({
      id:           listing.id,
      slug:         listing.slug,
      title:        listing.title,
      subtitle:     listing.subtitle,
      fullDescription: listing.fullDescription,
      badge:        listing.badge,
      stockProductCode: listing.stockProductCode,
      stockProductName: listing.stockProductName,
      pricePerUnit: Number(listing.pricePerUnit),
      maxQty:       Math.min(listing.maxQty, available),
      available,
    })
  } catch (err) {
    console.error('[Loja GET] Erro inesperado:', err)
    return NextResponse.json({ error: 'Erro ao carregar produto. Tente novamente.' }, { status: 500 })
  }
}

// ─── POST: gera PIX ───────────────────────────────────────────────────────────

const CPF_REGEX  = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/
const CNPJ_REGEX = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/

const schema = z.object({
  name:         z.string().min(2).max(200),
  // Aceita CPF (PF) ou CNPJ (PJ) — validação por regex básico
  cpf:          z.string().regex(CPF_REGEX, 'CPF inválido').optional(),
  cnpj:         z.string().regex(CNPJ_REGEX, 'CNPJ inválido').optional(),
  whatsapp:     z.string().regex(/^\+?55\d{10,11}$/, 'WhatsApp inválido (+5511999999999)'),
  email:        z.string().email().optional().or(z.literal('')),
  qty:          z.number().int().min(1).max(50),
  sellerRef:    z.string().max(100).optional(), // sellerId codificado pelo vendedor
  utm_source:   z.string().max(100).optional(),
  utm_medium:   z.string().max(100).optional(),
  utm_campaign: z.string().max(200).optional(),
  utm_content:  z.string().max(200).optional(),
  utm_term:     z.string().max(200).optional(),
  src:          z.string().max(200).optional(),
  utmSrc:       z.string().max(200).optional(), // alias do campo src
  fbclid:       z.string().max(512).optional(),
  gclid:        z.string().max(512).optional(),
  referrer:     z.string().max(500).optional(),
}).refine((d) => d.cpf || d.cnpj, { message: 'Informe CPF (PF) ou CNPJ (PJ)', path: ['cpf'] })

export async function POST(req: globalThis.Request, { params }: { params: { slug: string } }) {
  const listing = await getListingBySlug(params.slug)
  if (!listing) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const {
    name,
    cpf,
    cnpj,
    whatsapp,
    email,
    qty,
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
  } = parsed.data
  const waE164    = whatsapp.startsWith('+') ? whatsapp : `+${whatsapp}`
  const cpfClean  = cpf?.replace(/\D/g, '')  ?? ''
  const cnpjClean = cnpj?.replace(/\D/g, '') ?? ''
  // Documento armazenado no campo buyerCpf (suporta CPF=11 ou CNPJ=14 dígitos)
  const buyerDoc  = cnpjClean.length === 14 ? cnpjClean : cpfClean

  const session = await getServerSession(authOptions).catch(() => null)
  let checkoutSellerId: string | null =
    session?.user?.role === 'COMMERCIAL' || session?.user?.role === 'ADMIN'
      ? session.user.id
      : null
  const checkoutManagerId =
    session?.user?.role === 'COMMERCIAL' ? session.user.leaderId ?? null : null

  // Se o link veio com ?ref= do vendedor e a sessão não tem seller, resolve pelo sellerRef
  if (!checkoutSellerId && sellerRef) {
    const sellerUser = await prisma.user.findFirst({
      where: { id: sellerRef, role: { in: ['COMMERCIAL', 'ADMIN'] } },
      select: { id: true },
    }).catch(() => null)
    if (sellerUser) checkoutSellerId = sellerUser.id
  }

  const totalAmount = Number(listing.pricePerUnit) * qty
  const txid        = randomUUID().replace(/-/g, '').slice(0, 35)

  const reusableCheckout = await getReusablePendingCheckout({
    listingId: listing.id,
    buyerDoc,
    buyerWhatsapp: waE164,
    qty,
  })
  if (reusableCheckout && reusableCheckout.expiresAt && reusableCheckout.pixCopyPaste && reusableCheckout.pixQrCode) {
    const baseUrl = getPublicAppBaseUrl() || new URL(req.url).origin
    const resumeUrl = `${baseUrl}/loja/${listing.slug}?checkoutId=${encodeURIComponent(reusableCheckout.id)}`
    const orderNumber = await getQuickSaleOrderNumber(reusableCheckout.id).catch(() => null)
    await prisma.auditLog.create({
      data: {
        action: 'QUICK_SALE_PIX_REUSED',
        entity: 'QuickSaleCheckout',
        entityId: reusableCheckout.id,
        userId: checkoutSellerId,
        details: {
          checkoutId: reusableCheckout.id,
          listingId: listing.id,
          listingTitle: listing.title,
          buyerDoc,
          buyerWhatsapp: waE164,
          qty,
          orderNumber,
        },
      },
    }).catch((e) => console.error('[Loja PIX] Falha ao auditar reuso do checkout:', e))

    return NextResponse.json({
      checkoutId: reusableCheckout.id,
      txid: 'REUSED',
      pixCopyPaste: reusableCheckout.pixCopyPaste,
      qrCodeBase64: reusableCheckout.pixQrCode,
      expiresAt: reusableCheckout.expiresAt.toISOString(),
      totalAmount: Number(reusableCheckout.totalAmount),
      qty: reusableCheckout.qty,
      title: reusableCheckout.listing.title,
      orderNumber,
      resumeUrl,
      reusedCheckout: true,
    })
  }

  // 1. Gera PIX ANTES de bloquear ativos (evita segurar estoque se o Inter falhar)
  let pixData: { txid: string; pixCopyPaste: string; qrCodeBase64: string; expiresAt: Date }
  try {
    pixData = await generatePixCharge({
      txid,
      amount:       totalAmount,
      buyerName:    name,
      ...(cnpjClean.length === 14
        ? { buyerCnpj: cnpjClean }
        : { buyerCpf:  cpfClean }),
      description:  `${qty}x ${listing.title} — Ads Ativos`,
      expiracaoSec: 1800,
    })
  } catch (err) {
    console.error('[Loja PIX]', err)
    const code = mapInterPixErrorCode(err)
    return NextResponse.json({
      error: 'Falha ao gerar PIX. Tente novamente.',
      code,
    }, { status: 502 })
  }

  // 2. Reserva ativos de forma ATÔMICA dentro da transação
  //    updateMany retorna { count } — se count < qty, outra requisição chegou primeiro
  let checkout: Awaited<ReturnType<typeof prisma.quickSaleCheckout.create>>
  let generatedOrderNumber: string | null = null
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
      // Seleciona IDs dentro da transação para evitar leitura suja
          const candidates = await tx.asset.findMany({
            where:   buildAssetWhere(listing),
            select:  { id: true },
            take:    qty,
            orderBy: { createdAt: 'asc' },
          })

          if (candidates.length < qty) {
            throw new Error(`STOCK_INSUFFICIENT:${candidates.length}`)
          }

          const assetIds = candidates.map((a) => a.id)

          // Reserva atômica: só afeta registros que AINDA estão AVAILABLE
          const { count } = await tx.asset.updateMany({
            where: { id: { in: assetIds }, status: 'AVAILABLE' },
            data:  { status: 'QUARANTINE' },
          })

          // Se count < qty, outro processo tomou alguns antes de nós
          if (count < qty) {
            throw new Error(`STOCK_RACE:${count}`)
          }

          const reservedOrder = await reserveNextQuickSaleOrderNumber(tx)

          const createdCheckout = await createQuickCheckoutWithFallback(tx, {
            listingId:        listing.id,
            buyerName:        name,
            buyerCpf:         buyerDoc,   // CPF (11 dig) ou CNPJ (14 dig)
            buyerWhatsapp:    waE164,
            buyerEmail:       email || null,
            qty,
            stockProductCodeSnapshot: normalizeStockCode(listing.stockProductCode),
            stockProductNameSnapshot: normalizeStockName(listing.stockProductName),
            totalAmount,
            status:           'PENDING',
            interTxid:        pixData.txid,
            pixCopyPaste:     pixData.pixCopyPaste,
            pixQrCode:        pixData.qrCodeBase64,
            expiresAt:        pixData.expiresAt,
            reservedAssetIds: assetIds,
            sellerId:         checkoutSellerId,
            managerId:        checkoutManagerId,
            utmSource:        utm_source   ?? null,
            utmMedium:        utm_medium   ?? null,
            utmCampaign:      utm_campaign ?? null,
            utmContent:       utm_content  ?? null,
            utmTerm:          utm_term     ?? null,
            utmSrc:           src ?? utmSrc ?? null,
            fbclid:           fbclid       ?? null,
            gclid:            gclid        ?? null,
            referrer:         referrer     ?? null,
          })
          await attachQuickSaleOrderNumber(tx, createdCheckout.id, reservedOrder.orderNumber)

          return {
            checkout: createdCheckout,
            orderNumber: reservedOrder.orderNumber,
          }
        }, {
          // Isolamento máximo para evitar double-sell
          isolationLevel: 'Serializable',
        })
        break
      } catch (err) {
        if (attempt < MAX_TRANSACTION_RETRIES && isRetryableTransactionError(err)) {
          continue
        }
        throw err
      }
    }
    if (!txResult) {
      throw new Error('TRANSACTION_FAILED')
    }
    checkout = txResult.checkout
    generatedOrderNumber = txResult.orderNumber
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.startsWith('STOCK_INSUFFICIENT') || msg.startsWith('STOCK_RACE')) {
      const avail = msg.split(':')[1] ?? '0'
      return NextResponse.json({
        error: `Estoque insuficiente. Disponível: ${avail} unidade(s). Reduza a quantidade ou tente novamente.`,
      }, { status: 409 })
    }
    console.error('[Loja reserva]', err)
    return NextResponse.json({ error: 'Erro interno ao reservar estoque.' }, { status: 500 })
  }

  const baseUrl = getPublicAppBaseUrl() || new URL(req.url).origin
  const resumeUrl = `${baseUrl}/loja/${listing.slug}?checkoutId=${encodeURIComponent(checkout.id)}`

  sendUtmifyPixGerado({
    checkoutId: checkout.id,
    adsId: listing.id,
    displayName: listing.title,
    amountBrl: totalAmount,
    createdAt: checkout.createdAt,
    buyer: {
      name,
      email: email || '',
      whatsapp: waE164,
      cpf: buyerDoc,
    },
    utms: {
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
    },
  }).catch((e) => console.error('[Utmify quick PIX_GERADO]', e))

  const whatsappMsg = [
    '🚀 *PIX GERADO — ADS ATIVOS*',
    '',
    `Pedido: *${generatedOrderNumber ?? checkout.id}*`,
    `Produto: *${listing.title}*`,
    `Quantidade: *${qty}*`,
    `Valor: *R$ ${totalAmount.toFixed(2)}*`,
    '',
    '📋 *PIX Copia e Cola:*',
    pixData.pixCopyPaste,
    '',
    `🔳 *QR Code para pagamento:* ${resumeUrl}`,
    '',
    'Assim que o pagamento for aprovado, enviamos a confirmação automaticamente.',
  ].join('\n')

  sendWhatsApp({ phone: waE164, message: whatsappMsg })
    .catch((e) => console.error('[Loja WhatsApp PIX]', e))

  await prisma.auditLog.create({
    data: {
      action: 'QUICK_SALE_PIX_CREATED',
      entity: 'QuickSaleCheckout',
      entityId: checkout.id,
      userId: checkoutSellerId,
      details: {
        checkoutId: checkout.id,
        orderNumber: generatedOrderNumber,
        listingId: listing.id,
        listingTitle: listing.title,
        qty,
        totalAmount,
        buyerName: name,
        buyerDoc,
        buyerWhatsapp: waE164,
      },
    },
  }).catch((e) => console.error('[Loja PIX] Falha ao auditar criação:', e))

  return NextResponse.json({
    checkoutId:   checkout.id,
    txid:         pixData.txid,
    pixCopyPaste: pixData.pixCopyPaste,
    qrCodeBase64: pixData.qrCodeBase64,
    expiresAt:    pixData.expiresAt.toISOString(),
    totalAmount,
    qty,
    title:        listing.title,
    orderNumber:  generatedOrderNumber,
    resumeUrl,
  }, { status: 201 })
}

const deliverySchema = z.object({
  checkoutId: z.string().min(1),
  adspowerEmail: z.string().email('Informe um e-mail AdsPower válido'),
  adspowerProfileReleased: z.boolean(),
})

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

// ─── GET status do checkout ───────────────────────────────────────────────────
// Chamado pelo polling do frontend: GET /api/loja/[slug]?checkoutId=xxx

export async function HEAD(req: globalThis.Request) {
  const { searchParams } = new URL(req.url)
  const checkoutId = searchParams.get('checkoutId')
  if (!checkoutId) return new Response(null, { status: 400 })

  const co = await prisma.quickSaleCheckout.findUnique({
    where:  { id: checkoutId },
    select: { status: true },
  })
  if (!co) return new Response(null, { status: 404 })
  return new Response(null, { status: co.status === 'PAID' ? 200 : 202 })
}

function normalizeEmail(v: string) {
  return v.trim().toLowerCase()
}
