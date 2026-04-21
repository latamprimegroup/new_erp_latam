/**
 * PATCH /api/admin/ceo-tasks/[id] — Atualiza tarefa (status, dados)
 * DELETE /api/admin/ceo-tasks/[id] — Arquiva tarefa
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { CeoTaskCategory, CeoTaskStatus, CeoTaskPriority } from '@prisma/client'

const patchSchema = z.object({
  title:         z.string().min(3).max(300).optional(),
  description:   z.string().max(2000).optional(),
  category:      z.enum(['ESCALA', 'EFICIENCIA', 'INFRA', 'GESTAO']).optional(),
  impact:        z.number().int().min(1).max(10).optional(),
  urgency:       z.number().int().min(1).max(10).optional(),
  status:        z.enum(['TODO', 'DOING', 'DONE', 'ARCHIVED']).optional(),
  revenueImpact: z.number().min(0).optional(),
  dueDate:       z.string().nullable().optional(),
})

function calcScore(impact: number, urgency: number) { return impact * 2 + urgency }
function calcPriority(score: number): CeoTaskPriority {
  if (score >= 25) return 'CRITICAL'
  if (score >= 18) return 'HIGH'
  if (score >= 12) return 'MEDIUM'
  return 'LOW'
}

export async function PATCH(req: globalThis.Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })

  const task = await prisma.ceoTask.findUnique({ where: { id: params.id } })
  if (!task) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })

  const { title, description, category, impact, urgency, status, revenueImpact, dueDate } = parsed.data

  const newImpact  = impact  ?? task.impact
  const newUrgency = urgency ?? task.urgency
  const score      = calcScore(newImpact, newUrgency)

  const updates: Record<string, unknown> = {
    ...(title         !== undefined && { title }),
    ...(description   !== undefined && { description }),
    ...(category      !== undefined && { category: category as CeoTaskCategory }),
    ...(impact        !== undefined && { impact }),
    ...(urgency       !== undefined && { urgency }),
    ...(revenueImpact !== undefined && { revenueImpact }),
    ...(dueDate       !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
    priorityScore:   score,
    priority:        calcPriority(score),
  }

  if (status) {
    updates.status = status as CeoTaskStatus
    if (status === 'DONE' && task.status !== 'DONE') updates.completedAt = new Date()
    if (status !== 'DONE') updates.completedAt = null
  }

  const updated = await prisma.ceoTask.update({ where: { id: params.id }, data: updates })
  return NextResponse.json(updated)
}

export async function DELETE(_req: globalThis.Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })

  await prisma.ceoTask.update({ where: { id: params.id }, data: { status: 'ARCHIVED' } })
  return NextResponse.json({ ok: true })
}
