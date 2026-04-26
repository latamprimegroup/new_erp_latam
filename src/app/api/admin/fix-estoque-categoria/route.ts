/**
 * POST /api/admin/fix-estoque-categoria
 *
 * Correção emergencial: atualiza specs.listingCategory nos ativos criados
 * via estoque rápido que ficaram com category=CONTAS mas o listing busca
 * por GOOGLE_ADS, META_ADS etc.
 *
 * Também permite forçar a categoria de um Asset para bater com o listing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!['ADMIN', 'CEO'].includes((session?.user as { role?: string })?.role ?? '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    assetId?: string        // corrige 1 ativo específico
    listingId?: string      // corrige todos os ativos de um listing
    newCategory?: string    // força nova categoria (ex: CONTAS)
    listingCategory?: string // força listingCategory nos specs
  }

  const updated: string[] = []

  if (body.listingId) {
    // Busca o listing para obter stockProductCode e stockProductName
    const listing = await prisma.productListing.findUnique({
      where: { id: body.listingId },
      select: {
        id: true,
        assetCategory: true,
        stockProductCode: true,
        stockProductName: true,
      },
    })
    if (!listing) return NextResponse.json({ error: 'Listing não encontrado' }, { status: 404 })

    const nameNorm = listing.stockProductName?.trim()
    const codeNorm = listing.stockProductCode?.trim().toUpperCase()

    if (!nameNorm && !codeNorm) {
      return NextResponse.json({ error: 'Listing sem stockProductName nem stockProductCode' }, { status: 422 })
    }

    // Busca ativos que batem pelo nome ou código
    const assets = await prisma.asset.findMany({
      where: {
        status: { in: ['AVAILABLE', 'QUARANTINE'] },
        OR: [
          ...(codeNorm ? [{ adsId: codeNorm }] : []),
          ...(nameNorm ? [{ displayName: { contains: nameNorm } }] : []),
        ],
      },
      select: { id: true, adsId: true, specs: true, category: true },
    })

    for (const asset of assets) {
      const specs = (asset.specs ?? {}) as Record<string, unknown>
      await prisma.asset.update({
        where: { id: asset.id },
        data: {
          specs: {
            ...specs,
            listingCategory: listing.assetCategory,
          },
        },
      })
      updated.push(asset.adsId)
    }
  }

  if (body.assetId) {
    const asset = await prisma.asset.findUnique({
      where: { id: body.assetId },
      select: { id: true, adsId: true, specs: true },
    })
    if (!asset) return NextResponse.json({ error: 'Asset não encontrado' }, { status: 404 })

    const specs = (asset.specs ?? {}) as Record<string, unknown>
    const updateData: Record<string, unknown> = {
      specs: {
        ...specs,
        ...(body.listingCategory ? { listingCategory: body.listingCategory } : {}),
      },
    }
    if (body.newCategory) updateData.category = body.newCategory

    await prisma.asset.update({
      where: { id: body.assetId },
      data: updateData,
    })
    updated.push(asset.adsId)
  }

  return NextResponse.json({ ok: true, updated, count: updated.length })
}

// GET: lista ativos criados pelo estoque-rapido sem listingCategory
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!['ADMIN', 'CEO'].includes((session?.user as { role?: string })?.role ?? '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const assets = await prisma.asset.findMany({
    where: {
      tags: { contains: 'estoque-rapido' },
      status: { in: ['AVAILABLE', 'QUARANTINE'] },
    },
    select: {
      id: true, adsId: true, displayName: true, category: true, specs: true, status: true,
    },
    take: 100,
  })

  return NextResponse.json({
    assets: assets.map((a) => ({
      id: a.id,
      adsId: a.adsId,
      displayName: a.displayName,
      category: a.category,
      listingCategory: (a.specs as Record<string, unknown>)?.listingCategory ?? null,
      status: a.status,
    })),
  })
}
