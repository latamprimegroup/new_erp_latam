import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user.role ?? '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const includeInactive = searchParams.get('includeInactive') === '1'

  const listings = await prisma.productListing.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      badge: true,
      assetCategory: true,
      pricePerUnit: true,
      maxQty: true,
      active: true,
    },
    take: 80,
  })

  const categories = Array.from(new Set(listings.map((l) => l.assetCategory)))

  // Busca contagem de ativos disponíveis e distingue suspensos por fornecedor
  const [groupedAvailable, groupedSuspended] = categories.length
    ? await Promise.all([
        prisma.asset.groupBy({
          by: ['category'],
          where: {
            status: 'AVAILABLE',
            category: { in: categories as never[] },
            vendor: { suspended: false },  // só fornecedores ativos
          },
          _count: { _all: true },
        }),
        prisma.asset.groupBy({
          by: ['category'],
          where: {
            status: 'AVAILABLE',
            category: { in: categories as never[] },
            vendor: { suspended: true },  // fornecedores suspensos (stop-loss)
          },
          _count: { _all: true },
        }),
      ])
    : [[], []]

  const availableMap  = new Map<string, number>()
  const suspendedMap  = new Map<string, number>()
  for (const row of groupedAvailable)  availableMap.set(row.category, row._count._all)
  for (const row of groupedSuspended)  suspendedMap.set(row.category, row._count._all)

  const previewByCategory = new Map<
    string,
    Array<{
      adsId: string
      displayName: string
      salePrice: number
      authorityTag: string | null
      year: number | null
    }>
  >()

  await Promise.all(
    categories.map(async (category) => {
      const assets = await prisma.asset.findMany({
        where: {
          category: category as never,
          status: 'AVAILABLE',
        },
        select: {
          adsId: true,
          displayName: true,
          salePrice: true,
          specs: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 4,
      })
      previewByCategory.set(
        category,
        assets.map((asset) => {
          const specs = (asset.specs ?? {}) as Record<string, unknown>
          return {
            adsId: asset.adsId,
            displayName: asset.displayName,
            salePrice: Number(asset.salePrice),
            authorityTag: typeof specs.authorityTag === 'string' ? specs.authorityTag : null,
            year: typeof specs.year === 'number' ? specs.year : null,
          }
        })
      )
    })
  )

  const items = listings.map((listing) => {
    const available       = availableMap.get(listing.assetCategory) ?? 0
    const blockedByStopLoss = suspendedMap.get(listing.assetCategory) ?? 0
    return {
      id: listing.id,
      slug: listing.slug,
      title: listing.title,
      subtitle: listing.subtitle,
      badge: listing.badge,
      assetCategory: listing.assetCategory,
      pricePerUnit: Number(listing.pricePerUnit),
      maxQty: listing.maxQty,
      active: listing.active,
      available,                // já exclui ativos de fornecedores suspensos
      blockedByStopLoss,        // quantos ativos estão bloqueados por stop-loss
      stopLossWarning: blockedByStopLoss > 0,
      previewAssets: previewByCategory.get(listing.assetCategory) ?? [],
    }
  })

  return NextResponse.json({
    totals: {
      totalListings: items.length,
      activeListings: items.filter((i) => i.active).length,
      totalAvailable: items.reduce((sum, i) => sum + i.available, 0),
    },
    items,
  })
  } catch (err) {
    console.error('[seller/stock] Erro:', err)
    return NextResponse.json({ error: 'Erro ao carregar estoque', totals: { totalListings: 0, activeListings: 0, totalAvailable: 0 }, items: [] }, { status: 500 })
  }
}
