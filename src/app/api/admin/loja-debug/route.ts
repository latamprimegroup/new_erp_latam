import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!['ADMIN','CEO'].includes((session?.user as {role?:string})?.role ?? '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const slug = req.nextUrl.searchParams.get('slug') ?? ''
  
  try {
    const listing = await prisma.productListing.findFirst({
      where: { slug, active: true },
      select: { id: true, assetCategory: true, stockProductCode: true, stockProductName: true }
    })
    
    if (!listing) return NextResponse.json({ error: 'Listing não encontrado', slug })

    const assets = await prisma.asset.findMany({
      where: { status: 'AVAILABLE' },
      select: { id: true, adsId: true, displayName: true, category: true, specs: true },
      take: 10
    })

    const assetsByName = listing.stockProductName ? await prisma.asset.findMany({
      where: { status: 'AVAILABLE', displayName: { contains: listing.stockProductName } },
      select: { id: true, adsId: true, displayName: true, category: true },
      take: 5
    }) : []

    // Testa a transação com dados reais
    let txTest = null
    let txError = null
    try {
      await prisma.$transaction(async (tx) => {
        const seq = await tx.systemSetting.findUnique({ where: { key: 'quick_sale_order_sequence' } })
        txTest = { seqExists: !!seq, seqValue: seq?.value }
        throw new Error('TEST_ROLLBACK') // rollback proposital
      })
    } catch (e) {
      const msg = String((e as Error).message)
      if (msg !== 'TEST_ROLLBACK') txError = msg
    }

    return NextResponse.json({
      listing,
      totalAvailable: assets.length,
      assetsByName: assetsByName.length,
      sampleAssets: assets.slice(0,3).map(a => ({
        adsId: a.adsId, displayName: a.displayName, category: a.category,
        listingCategory: (a.specs as Record<string,unknown>)?.listingCategory
      })),
      txTest,
      txError,
    })
  } catch (e) {
    return NextResponse.json({ fatalError: String(e) }, { status: 500 })
  }
}
