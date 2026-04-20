import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

const createGoalSchema = z.object({
  userId: z.string().min(1),
  dailyTarget: z.number().int().positive(),
  monthlyTarget: z.number().int().positive(),
  bonus: z.number().optional(),
  minApprovalRatePercent: z.number().int().min(0).max(100).optional().nullable(),
  qualityBonus: z.number().min(0).optional().nullable(),
})

const releaseBonusSchema = z.object({
  goalId: z.string().min(1),
  value: z.number().positive(),
})

function rangeEndOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

async function volumeForUser(userId: string, start: Date, end: Date): Promise<number> {
  const [prodCount, g2Count] = await Promise.all([
    prisma.productionAccount.count({
      where: {
        producerId: userId,
        status: 'APPROVED',
        deletedAt: null,
        validatedAt: { not: null, gte: start, lte: end },
      },
    }),
    prisma.productionG2.count({
      where: {
        creatorId: userId,
        status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
        archivedAt: null,
        validatedAt: { not: null, gte: start, lte: end },
      },
    }),
  ])
  return prodCount + g2Count
}

/** Taxa de aprovação (Produção clássica) no intervalo — base para meta de qualidade */
async function approvalRateProduction(userId: string, start: Date, end: Date): Promise<number | null> {
  const [a, r] = await Promise.all([
    prisma.productionAccount.count({
      where: {
        producerId: userId,
        status: 'APPROVED',
        deletedAt: null,
        createdAt: { gte: start, lte: end },
      },
    }),
    prisma.productionAccount.count({
      where: {
        producerId: userId,
        status: 'REJECTED',
        deletedAt: null,
        createdAt: { gte: start, lte: end },
      },
    }),
  ])
  const t = a + r
  if (t === 0) return null
  return Math.round((a / t) * 1000) / 10
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  const historical = searchParams.get('historical') === '1'

  const now = new Date()
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const where: Record<string, unknown> = historical
    ? { periodEnd: { lt: startOfThisMonth } }
    : {
        periodStart: { lte: now },
        periodEnd: { gte: now },
      }

  if (userId) where.userId = userId
  if (session.user.role === 'PRODUCER') {
    where.userId = session.user.id
  }

  const goals = await prisma.goal.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true } },
      bonusReleases: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
    orderBy: historical ? [{ periodStart: 'desc' as const }, { user: { name: 'asc' } }] : { user: { name: 'asc' } },
    take: historical ? 200 : undefined,
  })

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

  const goalsEnriched = await Promise.all(
    goals.map(async (g) => {
      const rangeStart = historical ? new Date(g.periodStart) : startOfMonth
      const rangeEnd = historical ? rangeEndOfDay(new Date(g.periodEnd)) : endOfMonth
      rangeStart.setHours(0, 0, 0, 0)

      const productionCurrent = await volumeForUser(g.userId, rangeStart, rangeEnd)
      const approvalRatePercent = await approvalRateProduction(g.userId, rangeStart, rangeEnd)

      const minQ = g.minApprovalRatePercent
      const qb = g.qualityBonus != null ? Number(g.qualityBonus) : null
      const qualityEligible =
        minQ != null && qb != null && approvalRatePercent != null ? approvalRatePercent >= minQ : null

      return {
        id: g.id,
        userId: g.userId,
        dailyTarget: g.dailyTarget,
        monthlyTarget: g.monthlyTarget,
        status: g.status,
        periodStart: g.periodStart.toISOString(),
        periodEnd: g.periodEnd.toISOString(),
        bonus: g.bonus != null ? Number(g.bonus) : null,
        minApprovalRatePercent: g.minApprovalRatePercent,
        qualityBonus: qb,
        productionCurrent,
        approvalRatePercent,
        qualityEligible,
        user: g.user,
        bonusReleases: g.bonusReleases.map((br) => ({
          id: br.id,
          value: Number(br.value),
          status: br.status,
          releasedAt: br.releasedAt?.toISOString() ?? null,
          createdAt: br.createdAt.toISOString(),
        })),
      }
    })
  )

  return NextResponse.json(goalsEnriched)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()

    if (body.goalId && body.value !== undefined) {
      const { goalId, value } = releaseBonusSchema.parse(body)

      const goal = await prisma.goal.findUnique({ where: { id: goalId } })
      if (!goal) return NextResponse.json({ error: 'Meta não encontrada' }, { status: 404 })

      const release = await prisma.bonusRelease.create({
        data: {
          goalId,
          value,
          status: 'released',
          releasedAt: new Date(),
        },
      })

      await audit({
        userId: session.user.id,
        action: 'bonus_released',
        entity: 'BonusRelease',
        entityId: release.id,
        details: { goalId, value: Number(value) },
      })

      return NextResponse.json(release)
    }

    const data = createGoalSchema.parse(body)
    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    const existing = await prisma.goal.findFirst({
      where: {
        userId: data.userId,
        periodStart: { lte: periodEnd },
        periodEnd: { gte: periodStart },
      },
    })
    if (existing) return NextResponse.json({ error: 'Meta já existe para este período' }, { status: 400 })

    const goal = await prisma.goal.create({
      data: {
        userId: data.userId,
        dailyTarget: data.dailyTarget,
        monthlyTarget: data.monthlyTarget,
        bonus: data.bonus ?? null,
        minApprovalRatePercent:
          data.minApprovalRatePercent === undefined ? null : data.minApprovalRatePercent,
        qualityBonus: data.qualityBonus === undefined || data.qualityBonus === null ? null : data.qualityBonus,
        periodStart,
        periodEnd,
      },
      include: { user: { select: { name: true, email: true } } },
    })

    return NextResponse.json(goal)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao processar' }, { status: 500 })
  }
}
