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

function listingStockQtyKey(listingId: string) {
  return `${LISTING_STOCK_QTY_PREFIX}${listingId}`
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

  const { stockQty, paymentMode, globalGateways, ...listingPatch } = parsed.data

  const listing = await prisma.productListing.update({
    where: { id: params.id },
    data:  listingPatch,
  }).catch(() => null)

  if (!listing) return NextResponse.json({ error: 'Listing não encontrado' }, { status: 404 })

  if (stockQty == null) {
    // Se não houver alterações de gateway/modo, mantém configurações atuais
    if (!paymentMode && !globalGateways) {
      return NextResponse.json(listing)
    }
  }

  if (typeof stockQty === 'number' && stockQty > 0) {
    await prisma.systemSetting.upsert({
      where: { key: listingStockQtyKey(listing.id) },
      create: {
        key: listingStockQtyKey(listing.id),
        value: String(stockQty),
      },
      update: {
        value: String(stockQty),
      },
    })
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
    stockQtyConfigured: stockQty,
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
