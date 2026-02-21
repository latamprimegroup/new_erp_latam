import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'PRODUCER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json()
  const { userId } = body
  if (!userId) return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 })

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const [prodMonth, g2Month, prodDay, g2Day] = await Promise.all([
    prisma.productionAccount.count({
      where: {
        producerId: userId,
        status: 'APPROVED',
        validatedAt: { not: null, gte: startOfMonth, lte: endOfMonth },
      },
    }),
    prisma.productionG2.count({
      where: {
        creatorId: userId,
        status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
        validatedAt: { not: null, gte: startOfMonth, lte: endOfMonth },
      },
    }),
    prisma.productionAccount.count({
      where: {
        producerId: userId,
        status: 'APPROVED',
        validatedAt: { not: null, gte: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0) },
      },
    }),
    prisma.productionG2.count({
      where: {
        creatorId: userId,
        status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
        validatedAt: { not: null, gte: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0) },
      },
    }),
  ])
  const productionCount = prodMonth + g2Month
  const dailyCount = prodDay + g2Day

  const goal = await prisma.goal.findFirst({
    where: {
      userId,
      periodStart: { lte: endOfMonth },
      periodEnd: { gte: startOfMonth },
    },
  })

  if (goal) {
    await prisma.goal.update({
      where: { id: goal.id },
      data: { productionCurrent: productionCount },
    })
  }

  return NextResponse.json({
    daily: dailyCount,
    monthly: productionCount,
    goal,
  })
}
