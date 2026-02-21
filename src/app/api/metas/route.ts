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
})

const releaseBonusSchema = z.object({
  goalId: z.string().min(1),
  value: z.number().positive(),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  const where: Record<string, unknown> = {
    periodStart: { lte: new Date() },
    periodEnd: { gte: new Date() },
  }
  if (userId) where.userId = userId

  const goals = await prisma.goal.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true } },
      bonusReleases: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
    orderBy: { user: { name: 'asc' } },
  })

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  const goalsWithProduction = await Promise.all(
    goals.map(async (g) => {
      const [prodCount, g2Count] = await Promise.all([
        prisma.productionAccount.count({
          where: {
            producerId: g.userId,
            status: 'APPROVED',
            validatedAt: { not: null, gte: startOfMonth, lte: endOfMonth },
          },
        }),
        prisma.productionG2.count({
          where: {
            creatorId: g.userId,
            status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
            archivedAt: null,
            validatedAt: { not: null, gte: startOfMonth, lte: endOfMonth },
          },
        }),
      ])
      return { ...g, productionCurrent: prodCount + g2Count }
    })
  )

  return NextResponse.json(goalsWithProduction)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'PRODUCER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
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
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

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
