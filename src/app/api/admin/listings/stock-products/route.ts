import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function requireAccess() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  if (!['ADMIN', 'CEO', 'COMMERCIAL'].includes(session.user.role ?? '')) return null
  return session.user
}

export async function GET(req: NextRequest) {
  const user = await requireAccess()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim()
  const limit = Math.min(30, Math.max(1, Number(searchParams.get('limit') ?? 12)))
  const onlyAvailable = ['1', 'true', 'yes', 'on'].includes(
    (searchParams.get('onlyAvailable') ?? '').trim().toLowerCase(),
  )

  const assets = await prisma.asset.findMany({
    where: {
      vendor: { suspended: false },
      ...(onlyAvailable ? { status: 'AVAILABLE' } : {}),
      ...(q
        ? {
            OR: [
              { adsId: { contains: q } },
              { displayName: { contains: q } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      adsId: true,
      displayName: true,
      category: true,
      subCategory: true,
      salePrice: true,
      status: true,
      updatedAt: true,
      createdAt: true,
    },
    orderBy: [
      { updatedAt: 'desc' },
      { adsId: 'asc' },
    ],
    take: limit,
  })

  if (assets.length === 0) {
    return NextResponse.json({ items: [] })
  }

  const categories = Array.from(new Set(assets.map((a) => a.category)))
  const names = Array.from(new Set(assets.map((a) => a.displayName)))

  const [categoryCountsRaw, nameCountsRaw, nameTotalsRaw] = await Promise.all([
    Promise.all(categories.map(async (cat) => ({
      cat,
      count: await prisma.asset.count({
        where: {
          category: cat,
          status: 'AVAILABLE',
          vendor: { suspended: false },
        },
      }),
    }))),
    Promise.all(names.map(async (name) => ({
      name,
      count: await prisma.asset.count({
        where: {
          displayName: name,
          status: 'AVAILABLE',
          vendor: { suspended: false },
        },
      }),
    }))),
    Promise.all(names.map(async (name) => ({
      name,
      count: await prisma.asset.count({
        where: {
          displayName: name,
          vendor: { suspended: false },
        },
      }),
    }))),
  ])

  const categoryCounts = Object.fromEntries(categoryCountsRaw.map((row) => [row.cat, row.count]))
  const nameAvailableCounts = Object.fromEntries(nameCountsRaw.map((row) => [row.name, row.count]))
  const nameTotals = Object.fromEntries(nameTotalsRaw.map((row) => [row.name, row.count]))

  return NextResponse.json({
    items: assets.map((asset) => ({
      assetId: asset.id,
      adsId: asset.adsId,
      displayName: asset.displayName,
      category: asset.category,
      subCategory: asset.subCategory,
      salePrice: Number(asset.salePrice),
      isAvailable: asset.status === 'AVAILABLE',
      availableInCategory: categoryCounts[asset.category] ?? 0,
      availableForName: nameAvailableCounts[asset.displayName] ?? 0,
      totalInBaseForName: nameTotals[asset.displayName] ?? 0,
    })),
  })
}
