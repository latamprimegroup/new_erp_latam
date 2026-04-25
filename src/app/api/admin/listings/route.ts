/**
 * GET  /api/admin/listings — Lista todos os product listings
 * POST /api/admin/listings — Cria novo listing (gera link de venda rápida)
 */
import { NextResponse }    from 'next/server'
import { z }               from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'
import {
  listingGlobalGatewaysKey,
  listingPaymentModeKey,
  normalizeQuickSaleGlobalGateways,
  parseQuickSaleGlobalGateways,
  parseQuickSalePaymentMode,
  resolveQuickSalePaymentMethods,
  serializeQuickSaleGlobalGateways,
} from '@/lib/quick-sale-payments'

const LISTING_STOCK_QTY_PREFIX = 'quick_sale_listing_stock_qty:'

function listingStockQtyKey(listingId: string) {
  return `${LISTING_STOCK_QTY_PREFIX}${listingId}`
}

function parseStockQty(raw: string | null | undefined): number | null {
  const n = Number.parseInt(String(raw ?? '').trim(), 10)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

async function requireAccess() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  if (!['ADMIN', 'CEO', 'COMMERCIAL'].includes(session.user.role ?? '')) return null
  return session.user
}

const createSchema = z.object({
  title:         z.string().min(2).max(200),
  subtitle:      z.string().max(500).optional(),
  fullDescription: z.string().max(4000).optional(),
  assetCategory: z.string().min(1).max(50),
  assetTags:     z.string().max(200).optional(),
  stockProductCode: z.string().max(40).optional(),
  stockProductName: z.string().max(200).optional(),
  pricePerUnit:  z.number().positive(),
  maxQty:        z.number().int().min(1).max(100).default(10),
  stockQty:      z.number().int().min(1).max(100000).optional(),
  paymentMode:   z.enum(['PIX', 'GLOBAL']).optional().default('PIX'),
  globalGateways: z.array(z.enum(['KAST', 'MERCURY'])).optional(),
  badge:         z.string().max(100).optional(),
  active:        z.boolean().default(true),
})

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await requireAccess()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const listings = await prisma.productListing.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { checkouts: true } },
    },
  })

  const listingSettings = listings.length > 0
    ? await prisma.systemSetting.findMany({
        where: {
          key: {
            in: listings.flatMap((l) => ([
              listingStockQtyKey(l.id),
              listingPaymentModeKey(l.id),
              listingGlobalGatewaysKey(l.id),
            ])),
          },
        },
        select: { key: true, value: true },
      })
    : []
  const configuredStockByListing = new Map<string, number>()
  const paymentModeByListing = new Map<string, ReturnType<typeof parseQuickSalePaymentMode>>()
  const globalGatewaysByListing = new Map<string, ReturnType<typeof parseQuickSaleGlobalGateways>>()
  for (const setting of listingSettings) {
    if (setting.key.startsWith(LISTING_STOCK_QTY_PREFIX)) {
      const listingId = setting.key.replace(LISTING_STOCK_QTY_PREFIX, '')
      const qty = parseStockQty(setting.value)
      if (listingId && qty) configuredStockByListing.set(listingId, qty)
      continue
    }
    if (setting.key.startsWith('quick_sale_listing_payment_mode:')) {
      const listingId = setting.key.replace('quick_sale_listing_payment_mode:', '')
      if (listingId) paymentModeByListing.set(listingId, parseQuickSalePaymentMode(setting.value))
      continue
    }
    if (setting.key.startsWith('quick_sale_listing_global_gateways:')) {
      const listingId = setting.key.replace('quick_sale_listing_global_gateways:', '')
      if (listingId) globalGatewaysByListing.set(listingId, parseQuickSaleGlobalGateways(setting.value))
    }
  }

  // Conta disponíveis por categoria
  const enriched = await Promise.all(
    listings.map(async (l) => {
      const available = await prisma.asset.count({
        where: { category: l.assetCategory as never, status: 'AVAILABLE' },
      })
      const paidCheckouts = await prisma.quickSaleCheckout.count({
        where: { listingId: l.id, status: 'PAID' },
      })
      const reservedQty = await prisma.quickSaleCheckout.aggregate({
        where: { listingId: l.id, status: { in: ['PENDING', 'PAID'] } },
        _sum: { qty: true },
      })
      const revenue = await prisma.quickSaleCheckout.aggregate({
        where:  { listingId: l.id, status: 'PAID' },
        _sum:   { totalAmount: true },
      })
      const configuredStockQty = configuredStockByListing.get(l.id) ?? null
      const remainingStockQty = configuredStockQty == null
        ? null
        : Math.max(0, configuredStockQty - Number(reservedQty._sum.qty ?? 0))
      const effectiveAvailable = remainingStockQty ?? available
      const paymentMode = paymentModeByListing.get(l.id) ?? 'PIX'
      const globalGateways = globalGatewaysByListing.get(l.id) ?? ['KAST', 'MERCURY']
      const paymentMethods = resolveQuickSalePaymentMethods(paymentMode, globalGateways)
      return {
        id:           l.id,
        slug:         l.slug,
        title:        l.title,
        subtitle:     l.subtitle,
        fullDescription: l.fullDescription,
        badge:        l.badge,
        assetCategory:l.assetCategory,
        stockProductCode: l.stockProductCode,
        stockProductName: l.stockProductName,
        pricePerUnit: Number(l.pricePerUnit),
        maxQty:       l.maxQty,
        active:       l.active,
        paymentMode,
        globalGateways,
        paymentMethods,
        available: effectiveAvailable,
        stockQtyConfigured: configuredStockQty,
        stockQtyRemaining: remainingStockQty,
        totalCheckouts: l._count.checkouts,
        paidCheckouts,
        revenue:      Number(revenue._sum.totalAmount ?? 0),
        createdAt:    l.createdAt,
      }
    }),
  )

  return NextResponse.json(enriched)
}

// ─── POST ─────────────────────────────────────────────────────────────────────

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export async function POST(req: globalThis.Request) {
  const user = await requireAccess()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const d = parsed.data

  // Gera slug único
  let baseSlug = slugify(d.title)
  let slug     = baseSlug
  let attempt  = 1
  while (await prisma.productListing.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${attempt++}`
  }

  const listing = await prisma.productListing.create({
    data: {
      slug,
      title:         d.title,
      subtitle:      d.subtitle ?? null,
      fullDescription: d.fullDescription ?? null,
      assetCategory: d.assetCategory,
      assetTags:     d.assetTags ?? null,
      stockProductCode: d.stockProductCode ?? null,
      stockProductName: d.stockProductName ?? null,
      pricePerUnit:  d.pricePerUnit,
      maxQty:        d.maxQty,
      badge:         d.badge ?? 'ENTREGA AUTOMÁTICA',
      active:        d.active,
      createdBy:     user.id,
    },
  })

  if (d.stockQty && d.stockQty > 0) {
    await prisma.systemSetting.upsert({
      where: { key: listingStockQtyKey(listing.id) },
      create: {
        key: listingStockQtyKey(listing.id),
        value: String(d.stockQty),
      },
      update: {
        value: String(d.stockQty),
      },
    })
  }

  const normalizedGlobalGateways = normalizeQuickSaleGlobalGateways(d.globalGateways)
  await prisma.systemSetting.upsert({
    where: { key: listingPaymentModeKey(listing.id) },
    create: {
      key: listingPaymentModeKey(listing.id),
      value: d.paymentMode,
    },
    update: {
      value: d.paymentMode,
    },
  })

  if (d.paymentMode === 'GLOBAL') {
    await prisma.systemSetting.upsert({
      where: { key: listingGlobalGatewaysKey(listing.id) },
      create: {
        key: listingGlobalGatewaysKey(listing.id),
        value: serializeQuickSaleGlobalGateways(normalizedGlobalGateways),
      },
      update: {
        value: serializeQuickSaleGlobalGateways(normalizedGlobalGateways),
      },
    })
  }

  return NextResponse.json({
    ...listing,
    slug,
    stockQtyConfigured: d.stockQty ?? null,
    paymentMode: d.paymentMode,
    globalGateways: d.paymentMode === 'GLOBAL' ? normalizedGlobalGateways : [],
    paymentMethods: d.paymentMode === 'GLOBAL' ? normalizedGlobalGateways : ['PIX'],
  }, { status: 201 })
}
