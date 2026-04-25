/**
 * PATCH /api/admin/listings/[id] — Atualiza listing (ativar/pausar, preço, etc.)
 * DELETE /api/admin/listings/[id] — Remove listing
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
  serializeQuickSaleGlobalGateways,
} from '@/lib/quick-sale-payments'

const LISTING_STOCK_QTY_PREFIX = 'quick_sale_listing_stock_qty:'
const STOCK_QTY_ABOVE_SUGGESTED_CODE = 'STOCK_QTY_ABOVE_SUGGESTED'
const FORCE_STOCK_QTY_NOT_ALLOWED_CODE = 'FORCE_STOCK_QTY_NOT_ALLOWED'

function listingStockQtyKey(listingId: string) {
  return `${LISTING_STOCK_QTY_PREFIX}${listingId}`
}

function normalizeStockCode(v: string | null | undefined) {
  const normalized = (v ?? '').trim().toUpperCase()
  return normalized || null
}

function normalizeStockName(v: string | null | undefined) {
  const normalized = (v ?? '').trim()
  return normalized || null
}

async function resolveSuggestedLinkStockQty(input: {
  assetCategory: string
  stockProductCode?: string | null
  stockProductName?: string | null
}) {
  const code = normalizeStockCode(input.stockProductCode)
  let name = normalizeStockName(input.stockProductName)
  let category = input.assetCategory

  if (code) {
    const stockAsset = await prisma.asset.findFirst({
      where: {
        adsId: code,
        vendor: { suspended: false },
      },
      select: {
        displayName: true,
        category: true,
      },
    })
    if (stockAsset) {
      category = stockAsset.category
      if (!name) name = stockAsset.displayName
    }
  }

  const [availableInCategory, availableForName, totalInBaseForName] = await Promise.all([
    prisma.asset.count({
      where: {
        category,
        status: 'AVAILABLE',
        vendor: { suspended: false },
      },
    }),
    name
      ? prisma.asset.count({
          where: {
            displayName: name,
            status: 'AVAILABLE',
            vendor: { suspended: false },
          },
        })
      : Promise.resolve(0),
    name
      ? prisma.asset.count({
          where: {
            displayName: name,
            vendor: { suspended: false },
          },
        })
      : Promise.resolve(0),
  ])

  return Math.max(1, availableForName || availableInCategory || totalInBaseForName || 1)
}

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['ADMIN', 'CEO', 'COMMERCIAL'].includes(session.user.role ?? '')) return null
  return session.user
}

const patchSchema = z.object({
  title:        z.string().min(2).max(200).optional(),
  subtitle:     z.string().max(500).nullable().optional(),
  fullDescription: z.string().max(8000).nullable().optional(),
  pricePerUnit: z.number().positive().optional(),
  maxQty:       z.number().int().min(1).max(100).optional(),
  stockQty:     z.number().int().min(1).max(100000).nullable().optional(),
  badge:        z.string().max(100).nullable().optional(),
  stockProductCode: z.string().max(40).nullable().optional(),
  stockProductName: z.string().max(200).nullable().optional(),
  forceStockQty: z.boolean().optional().default(false),
  syncStockQty: z.boolean().optional().default(false),
  paymentMode: z.enum(['PIX', 'GLOBAL']).optional(),
  globalGateways: z.array(z.enum(['KAST', 'MERCURY'])).optional(),
  active:       z.boolean().optional(),
})

export async function PATCH(
  req: globalThis.Request,
  { params }: { params: { id: string } },
) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const {
    stockQty,
    forceStockQty,
    syncStockQty,
    paymentMode,
    globalGateways,
    ...listingPatch
  } = parsed.data

  const canForceStockQty = ['ADMIN', 'CEO'].includes(user.role ?? '')
  if (forceStockQty && !canForceStockQty) {
    return NextResponse.json({
      error: 'Somente ADMIN/CEO pode forçar estoque acima do sugerido pela base.',
      code: FORCE_STOCK_QTY_NOT_ALLOWED_CODE,
    }, { status: 403 })
  }
  if (syncStockQty && typeof stockQty === 'number') {
    return NextResponse.json({
      error: 'Envie apenas syncStockQty ou stockQty manual, não os dois juntos.',
    }, { status: 422 })
  }

  const existingListing = await prisma.productListing.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      assetCategory: true,
      stockProductCode: true,
      stockProductName: true,
    },
  })
  if (!existingListing) return NextResponse.json({ error: 'Listing não encontrado' }, { status: 404 })

  const finalCategory = existingListing.assetCategory
  const finalStockProductCode = listingPatch.stockProductCode === undefined
    ? existingListing.stockProductCode
    : listingPatch.stockProductCode
  const finalStockProductName = listingPatch.stockProductName === undefined
    ? existingListing.stockProductName
    : listingPatch.stockProductName

  let suggestedStockQty: number | null = null
  let stockQtyToPersist: number | null | undefined = undefined
  if (syncStockQty || typeof stockQty === 'number') {
    suggestedStockQty = await resolveSuggestedLinkStockQty({
      assetCategory: finalCategory,
      stockProductCode: finalStockProductCode,
      stockProductName: finalStockProductName,
    })
  }
  if (syncStockQty) {
    stockQtyToPersist = suggestedStockQty
  } else if (typeof stockQty === 'number') {
    stockQtyToPersist = stockQty
    if (suggestedStockQty != null && stockQty > suggestedStockQty && !forceStockQty) {
      return NextResponse.json({
        error: `Estoque do link acima do sugerido pela base (${suggestedStockQty}).`,
        code: STOCK_QTY_ABOVE_SUGGESTED_CODE,
        requestedStockQty: stockQty,
        suggestedStockQty,
        canForce: canForceStockQty,
      }, { status: 409 })
    }
  } else if (stockQty === null) {
    stockQtyToPersist = null
  }

  const listing = await prisma.productListing.update({
    where: { id: params.id },
    data:  listingPatch,
  }).catch(() => null)

  if (!listing) return NextResponse.json({ error: 'Listing não encontrado' }, { status: 404 })

  if (stockQtyToPersist == null && !syncStockQty) {
    // Se não houver alterações de gateway/modo, mantém configurações atuais
    if (!paymentMode && !globalGateways) {
      return NextResponse.json(listing)
    }
  }

  if (typeof stockQtyToPersist === 'number' && stockQtyToPersist > 0) {
    await prisma.systemSetting.upsert({
      where: { key: listingStockQtyKey(listing.id) },
      create: {
        key: listingStockQtyKey(listing.id),
        value: String(stockQtyToPersist),
      },
      update: {
        value: String(stockQtyToPersist),
      },
    })
  } else if (stockQtyToPersist === null) {
    await prisma.systemSetting.delete({
      where: { key: listingStockQtyKey(listing.id) },
    }).catch(() => null)
  }

  if (paymentMode) {
    await prisma.systemSetting.upsert({
      where: { key: listingPaymentModeKey(listing.id) },
      create: {
        key: listingPaymentModeKey(listing.id),
        value: paymentMode,
      },
      update: {
        value: paymentMode,
      },
    })
  }

  if (globalGateways) {
    const normalized = normalizeQuickSaleGlobalGateways(globalGateways)
    await prisma.systemSetting.upsert({
      where: { key: listingGlobalGatewaysKey(listing.id) },
      create: {
        key: listingGlobalGatewaysKey(listing.id),
        value: serializeQuickSaleGlobalGateways(normalized),
      },
      update: {
        value: serializeQuickSaleGlobalGateways(normalized),
      },
    })
  }

  return NextResponse.json({
    ...listing,
    stockQtyConfigured: stockQtyToPersist ?? null,
    suggestedStockQty: suggestedStockQty ?? undefined,
    stockQtySynced: syncStockQty ? true : undefined,
    paymentMode: paymentMode ?? undefined,
    globalGateways: globalGateways ?? undefined,
  })
}

export async function DELETE(
  _req: globalThis.Request,
  { params }: { params: { id: string } },
) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const listing = await prisma.productListing.delete({
    where: { id: params.id },
  }).catch(() => null)

  if (!listing) return NextResponse.json({ error: 'Listing não encontrado' }, { status: 404 })
  await prisma.systemSetting.delete({
    where: { key: listingStockQtyKey(listing.id) },
  }).catch(() => null)
  await prisma.systemSetting.delete({
    where: { key: listingPaymentModeKey(listing.id) },
  }).catch(() => null)
  await prisma.systemSetting.delete({
    where: { key: listingGlobalGatewaysKey(listing.id) },
  }).catch(() => null)
  return NextResponse.json({ ok: true })
}
