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
  const limit = Math.min(20, Math.max(1, Number(searchParams.get('limit') ?? 8)))

  const assets = await prisma.asset.findMany({
    where: {
      status: 'AVAILABLE',
      vendor: { suspended: false },
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
      updatedAt: true,
    },
    orderBy: [
      { updatedAt: 'desc' },
      { adsId: 'asc' },
    ],
    take: limit,
  })

  return NextResponse.json({
    items: assets.map((asset) => ({
      id: asset.id,
      code: asset.adsId,
      name: asset.displayName,
      category: asset.category,
      subCategory: asset.subCategory,
      salePrice: Number(asset.salePrice),
    })),
  })
}
