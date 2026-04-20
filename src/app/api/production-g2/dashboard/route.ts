import { NextRequest, NextResponse } from 'next/server'
import type { ProductionG2Status } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const G2_STOCK_OR_APPROVED: ProductionG2Status[] = ['APROVADA', 'ENVIADA_ESTOQUE']

export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER', 'FINANCE'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  let creatorId = searchParams.get('creatorId')
  const currency = searchParams.get('currency')

  if (auth.session.user?.role === 'PRODUCER') {
    creatorId = auth.session.user.id
  }

  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  const lookback90 = new Date(now)
  lookback90.setDate(lookback90.getDate() - 90)

  const whereBase: { archivedAt: null; deletedAt: null; creatorId?: string; currency?: string } = { archivedAt: null, deletedAt: null }
  if (creatorId) whereBase.creatorId = creatorId
  if (currency) whereBase.currency = currency

  const prevMonthIdx = now.getMonth() === 0 ? 11 : now.getMonth() - 1
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const startPrevMonth = new Date(prevYear, prevMonthIdx, 1)
  const lastDayPrev = new Date(prevYear, prevMonthIdx + 1, 0).getDate()
  const compareDay = Math.min(now.getDate(), lastDayPrev)
  const endComparePrevMonth = new Date(prevYear, prevMonthIdx, compareDay, 23, 59, 59, 999)

  const prodWhereScoped = {
    status: 'APPROVED' as const,
    deletedAt: null as null,
    validatedAt: { not: null as null },
    ...(creatorId ? { producerId: creatorId } : {}),
  }

  const g2WhereValidatedInRange = (from: Date, to: Date) => ({
    ...whereBase,
    status: { in: G2_STOCK_OR_APPROVED },
    validatedAt: { gte: from, lte: to },
  })

  const [
    totalToday,
    totalMonth,
    inReview,
    rejected,
    approved,
    byCreator,
    validatedThisPeriodProd,
    validatedThisPeriodG2,
    validatedPrevPeriodProd,
    validatedPrevPeriodG2,
    rejectedReasonRows,
    approvedTimingSamples,
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
      where: { ...whereBase, status: { in: G2_STOCK_OR_APPROVED } },
      _count: { id: true },
    }),
    prisma.productionAccount.count({
      where: {
        ...prodWhereScoped,
        validatedAt: { gte: startOfMonth, lte: endToday },
      },
    }),
    prisma.productionG2.count({
      where: g2WhereValidatedInRange(startOfMonth, endToday),
    }),
    prisma.productionAccount.count({
      where: {
        ...prodWhereScoped,
        validatedAt: { gte: startPrevMonth, lte: endComparePrevMonth },
      },
    }),
    prisma.productionG2.count({
      where: g2WhereValidatedInRange(startPrevMonth, endComparePrevMonth),
    }),
    prisma.productionG2.findMany({
      where: {
        ...whereBase,
        status: 'REPROVADA',
        rejectedReason: { not: null },
      },
      select: { rejectedReason: true },
    }),
    prisma.productionG2.findMany({
      where: {
        ...whereBase,
        status: { in: G2_STOCK_OR_APPROVED },
        approvedAt: { not: null },
        createdAt: { gte: lookback90 },
      },
      select: { createdAt: true, approvedAt: true },
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

  const validatedThisMonthToDate = validatedThisPeriodProd + validatedThisPeriodG2
  const validatedLastMonthSamePeriod = validatedPrevPeriodProd + validatedPrevPeriodG2
  const deltaVsLastMonth = validatedThisMonthToDate - validatedLastMonthSamePeriod

  const rejectionBuckets = new Map<string, number>()
  for (const row of rejectedReasonRows) {
    const key = (row.rejectedReason || '').trim().slice(0, 200) || '(Sem texto)'
    rejectionBuckets.set(key, (rejectionBuckets.get(key) ?? 0) + 1)
  }
  const rejectionInsights = Array.from(rejectionBuckets.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)

  let avgReviewHours: number | null = null
  if (approvedTimingSamples.length >= 3) {
    const sumMs = approvedTimingSamples.reduce(
      (acc, s) => acc + (s.approvedAt!.getTime() - s.createdAt.getTime()),
      0
    )
    avgReviewHours = Math.round((sumMs / approvedTimingSamples.length / 3_600_000) * 10) / 10
  }

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
    rejectionInsights,
    reviewPipeline: {
      avgHoursCreatedToApproval: avgReviewHours,
      sampleSize: approvedTimingSamples.length,
    },
    metaHistory: {
      /** Contas contando para a meta (validadas no mês), até hoje — alinhado ao motor de meta. */
      validatedThisMonthToDate,
      /** Mesmo recorte no mês anterior (dia 1 até o mesmo dia civil). */
      validatedLastMonthSamePeriod,
      deltaVsLastMonth,
      periodLabelThisMonth: `${startOfMonth.toLocaleDateString('pt-BR')} → ${endToday.toLocaleDateString('pt-BR')}`,
      periodLabelPrevMonth: `${startPrevMonth.toLocaleDateString('pt-BR')} → ${endComparePrevMonth.toLocaleDateString('pt-BR')}`,
    },
  })
}
