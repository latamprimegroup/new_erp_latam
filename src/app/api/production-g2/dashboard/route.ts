import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER', 'FINANCE'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const creatorId = searchParams.get('creatorId')
  const currency = searchParams.get('currency')

  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const whereBase: { archivedAt: null; deletedAt: null; creatorId?: string; currency?: string } = { archivedAt: null, deletedAt: null }
  if (creatorId) whereBase.creatorId = creatorId
  if (currency) whereBase.currency = currency

  const [
    totalToday,
    totalMonth,
    inReview,
    rejected,
    approved,
    byCreator,
  ] = await Promise.all([
    prisma.productionG2.count({
      where: { ...whereBase, status: 'ENVIADA_ESTOQUE', sentToStockAt: { gte: startOfDay } },
    }),
    prisma.productionG2.count({
      where: { ...whereBase, status: 'ENVIADA_ESTOQUE', sentToStockAt: { gte: startOfMonth } },
    }),
    prisma.productionG2.count({ where: { ...whereBase, status: 'EM_REVISAO' } }),
    prisma.productionG2.count({ where: { ...whereBase, status: 'REPROVADA' } }),
    prisma.productionG2.count({ where: { ...whereBase, status: 'APROVADA' } }),
    prisma.productionG2.groupBy({
      by: ['creatorId'],
      where: { ...whereBase, status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] } },
      _count: { id: true },
    }),
  ])

  const creatorIds = byCreator.map((c) => c.creatorId)
  const creators = await prisma.user.findMany({
    where: { id: { in: creatorIds } },
    select: { id: true, name: true },
  })
  const creatorMap = Object.fromEntries(creators.map((c) => [c.id, c.name]))

  const approvalRate = approved + rejected > 0
    ? Math.round((approved / (approved + rejected)) * 100)
    : 0

  const productionByCreator = byCreator.map((c) => ({
    creatorId: c.creatorId,
    creatorName: creatorMap[c.creatorId] || 'N/A',
    count: c._count.id,
  }))

  return NextResponse.json({
    kpis: {
      totalToday,
      totalMonth,
      inReview,
      rejected,
      approved,
      approvalRate,
    },
    productionByCreator,
  })
}
