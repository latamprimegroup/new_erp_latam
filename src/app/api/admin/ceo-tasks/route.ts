/**
 * GET  /api/admin/ceo-tasks — Lista tarefas ordenadas por priority_score
 * POST /api/admin/ceo-tasks — Cria nova tarefa
 *
 * Priority Score = (impact × 2) + urgency
 * Apenas ADMIN.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { CeoTaskCategory, CeoTaskStatus, CeoTaskPriority } from '@prisma/client'

const ALLOWED = ['ADMIN']

function calcScore(impact: number, urgency: number) {
  return impact * 2 + urgency
}

function calcPriority(score: number): CeoTaskPriority {
  if (score >= 25) return 'CRITICAL'
  if (score >= 18) return 'HIGH'
  if (score >= 12) return 'MEDIUM'
  return 'LOW'
}

const createSchema = z.object({
  title:         z.string().min(3).max(300),
  description:   z.string().max(2000).optional(),
  category:      z.enum(['ESCALA', 'EFICIENCIA', 'INFRA', 'GESTAO']),
  impact:        z.number().int().min(1).max(10).default(5),
  urgency:       z.number().int().min(1).max(10).default(5),
  revenueImpact: z.number().min(0).optional(),
  dueDate:       z.string().optional(),
  status:        z.enum(['TODO', 'DOING', 'DONE', 'ARCHIVED']).optional(),
})

export async function GET(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Acesso restrito ao CEO/Admin' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status   = searchParams.get('status') as CeoTaskStatus | null
  const category = searchParams.get('category') as CeoTaskCategory | null
  const mode     = searchParams.get('mode')  // 'focus' → apenas top 3

  const where: Record<string, unknown> = {}
  if (status)   where.status   = status
  if (category) where.category = category

  const tasks = await prisma.ceoTask.findMany({
    where,
    orderBy: [{ priorityScore: 'desc' }, { createdAt: 'asc' }],
    take:    mode === 'focus' ? 3 : 200,
    include: { createdBy: { select: { name: true } } },
  })

  // Estatísticas para o dashboard
  const byStatus   = await prisma.ceoTask.groupBy({ by: ['status'], _count: true })
  const byCategory = await prisma.ceoTask.groupBy({ by: ['category'], _count: true, where: { status: { not: 'ARCHIVED' } } })

  // Alerta de Escala: % de tarefas DONE que são ESCALA (últimos 7 dias)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000)
  const doneLast7    = await prisma.ceoTask.findMany({
    where: { status: 'DONE', completedAt: { gte: sevenDaysAgo } },
    select: { category: true },
  })
  const escalaCompletedPct = doneLast7.length === 0 ? 100
    : Math.round((doneLast7.filter((t) => t.category === 'ESCALA').length / doneLast7.length) * 100)

  return NextResponse.json({
    tasks,
    stats: {
      byStatus:          Object.fromEntries(byStatus.map((b) => [b.status, b._count])),
      byCategory:        Object.fromEntries(byCategory.map((b) => [b.category, b._count])),
      escalaCompletedPct,
      escalaAlert:       escalaCompletedPct < 50,
    },
  })
}

export async function POST(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Acesso restrito ao CEO/Admin' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const { title, description, category, impact, urgency, revenueImpact, dueDate, status } = parsed.data
  const score    = calcScore(impact, urgency)
  const priority = calcPriority(score)

  const task = await prisma.ceoTask.create({
    data: {
      title, description, category: category as CeoTaskCategory,
      impact, urgency,
      priorityScore: score,
      priority,
      revenueImpact: revenueImpact ?? undefined,
      dueDate:       dueDate ? new Date(dueDate) : undefined,
      status:        (status as CeoTaskStatus) ?? 'TODO',
      createdById:   session.user.id,
    },
  })

  return NextResponse.json(task, { status: 201 })
}
