import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
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

  const groupedAvailable = categories.length
    ? await prisma.asset.groupBy({
        by: ['category'],
        where: {
          status: 'AVAILABLE',
          category: { in: categories as never[] },
        },
        _count: { _all: true },
      })
    : []

  const availableMap = new Map<string, number>()
  for (const row of groupedAvailable) {
    availableMap.set(row.category, row._count._all)
  }

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

  const items = listings.map((listing) => ({
    id: listing.id,
    slug: listing.slug,
    title: listing.title,
    subtitle: listing.subtitle,
    badge: listing.badge,
    assetCategory: listing.assetCategory,
    pricePerUnit: Number(listing.pricePerUnit),
    maxQty: listing.maxQty,
    active: listing.active,
    available: availableMap.get(listing.assetCategory) ?? 0,
    previewAssets: previewByCategory.get(listing.assetCategory) ?? [],
  }))

  return NextResponse.json({
    totals: {
      totalListings: items.length,
      activeListings: items.filter((i) => i.active).length,
      totalAvailable: items.reduce((sum, i) => sum + i.available, 0),
    },
    items,
  })
}
