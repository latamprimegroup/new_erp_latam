import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireCommercialManagerAccess } from '@/lib/commercial-hierarchy'

const schema = z.object({
  assetId: z.string().min(1),
  markupPct: z.number().min(0).max(500),
  minMarginPct: z.number().min(0).max(500).optional(),
})

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * PATCH /api/commercial/manager/markup
 * Gerente comercial define markup/margem para liberar vitrine do time.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireCommercialManagerAccess()
  if (!auth.ok) return auth.response

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || 'Dados inválidos' },
      { status: 422 }
    )
  }

  const { assetId, markupPct, minMarginPct } = parsed.data
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { id: true, costPrice: true, minMarginPct: true },
  })
  if (!asset) return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 })

  const cost = Number(asset.costPrice ?? 0)
  const floorPct = minMarginPct ?? Number(asset.minMarginPct ?? 40)
  const salePrice = round2(cost * (1 + markupPct / 100))
  const floorPrice = round2(cost * (1 + floorPct / 100))

  const updated = await prisma.asset.update({
    where: { id: assetId },
    data: {
      markupPct,
      minMarginPct: floorPct,
      floorPrice,
      salePrice,
    },
    select: {
      id: true,
      adsId: true,
      salePrice: true,
      floorPrice: true,
      markupPct: true,
      minMarginPct: true,
      updatedAt: true,
    },
  })

  await prisma.commercialDataAuditLog.create({
    data: {
      userId: auth.session.user.id,
      role: auth.session.user.role || 'COMMERCIAL',
      action: 'MANAGER_MARKUP_UPDATE',
      entityType: 'Asset',
      entityId: assetId,
      metadata: {
        adsId: updated.adsId,
        markupPct,
        minMarginPct: floorPct,
        salePrice,
        floorPrice,
      } as never,
    },
  }).catch((e) => console.error('[ManagerMarkup] audit error', e))

  return NextResponse.json({
    ok: true,
    asset: {
      ...updated,
      salePrice: Number(updated.salePrice),
      floorPrice: Number(updated.floorPrice ?? 0),
      markupPct: Number(updated.markupPct ?? 0),
      minMarginPct: Number(updated.minMarginPct ?? 0),
    },
  })
}
