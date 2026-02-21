import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Catálogo de contas disponíveis para cotação (usado em Pesquisar Contas)
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const platform = searchParams.get('platform')
  const type = searchParams.get('type')
  const yearMin = searchParams.get('yearMin')
  const consumoMin = searchParams.get('consumoMin')
  const niche = searchParams.get('niche')

  const where: Record<string, unknown> = { status: 'AVAILABLE' }
  if (platform) where.platform = platform
  if (type) where.type = { contains: type, mode: 'insensitive' }
  if (yearMin) where.yearStarted = { gte: parseInt(yearMin, 10) }
  if (consumoMin) where.minConsumed = { gte: parseFloat(consumoMin) }
  if (niche) where.niche = { contains: niche, mode: 'insensitive' }

  const accounts = await prisma.stockAccount.findMany({
    where,
    select: {
      id: true,
      platform: true,
      type: true,
      yearStarted: true,
      niche: true,
      minConsumed: true,
      salePrice: true,
      description: true,
    },
  })

  const PLATFORM_LABELS: Record<string, string> = {
    GOOGLE_ADS: 'Google Ads',
    META_ADS: 'Meta Ads',
    KWAI_ADS: 'Kwai Ads',
    TIKTOK_ADS: 'TikTok Ads',
    OTHER: 'Outro',
  }

  return NextResponse.json(
    accounts.map((a) => ({
      id: a.id,
      platform: a.platform,
      platformLabel: PLATFORM_LABELS[a.platform] || a.platform,
      type: a.type,
      yearStarted: a.yearStarted,
      niche: a.niche,
      minConsumed: a.minConsumed ? Number(a.minConsumed) : null,
      salePrice: a.salePrice ? Number(a.salePrice) : null,
      description: a.description,
    }))
  )
}
