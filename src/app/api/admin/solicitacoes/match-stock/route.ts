import { NextRequest, NextResponse } from 'next/server'
import type { AccountPlatform, Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const PLATFORMS: AccountPlatform[] = ['GOOGLE_ADS', 'META_ADS', 'TIKTOK_ADS', 'KWAI_ADS', 'OTHER']

/**
 * GET ?solicitationId= — lista StockAccount AVAILABLE com tipo/plataforma próximos ao pedido.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN' && session.user?.role !== 'COMMERCIAL') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const id = req.nextUrl.searchParams.get('solicitationId')
  if (!id) return NextResponse.json({ error: 'solicitationId obrigatório' }, { status: 400 })

  const s = await prisma.accountSolicitation.findUnique({
    where: { id },
    select: { accountType: true, product: true, country: true },
  })
  if (!s) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 })

  const typeNorm = s.accountType.trim()
  const productLower = s.product.toLowerCase()

  const platformHints: AccountPlatform[] = []
  if (productLower.includes('google') || productLower.includes('ads')) platformHints.push('GOOGLE_ADS')
  if (productLower.includes('meta') || productLower.includes('facebook') || productLower.includes('fb'))
    platformHints.push('META_ADS')
  if (productLower.includes('tiktok')) platformHints.push('TIKTOK_ADS')
  if (productLower.includes('kwai')) platformHints.push('KWAI_ADS')

  const orFilters: Prisma.StockAccountWhereInput[] = []
  if (typeNorm.length >= 2) orFilters.push({ type: { contains: typeNorm } })
  const uniqPlats = [...new Set(platformHints)].filter((p) => PLATFORMS.includes(p))
  if (uniqPlats.length > 0) orFilters.push({ platform: { in: uniqPlats } })

  const where: Prisma.StockAccountWhereInput = {
    deletedAt: null,
    status: 'AVAILABLE',
    archivedAt: null,
    ...(orFilters.length > 0 ? { OR: orFilters } : {}),
  }

  const accounts = await prisma.stockAccount.findMany({
    where,
    select: {
      id: true,
      type: true,
      platform: true,
      salePrice: true,
      purchasePrice: true,
      niche: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return NextResponse.json({
    solicitationId: id,
    matched: accounts.map((a) => ({
      id: a.id,
      type: a.type,
      platform: a.platform,
      salePrice: a.salePrice != null ? Number(a.salePrice) : null,
      niche: a.niche,
    })),
  })
}
