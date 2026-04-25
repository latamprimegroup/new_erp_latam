/**
 * PATCH  /api/admin/plans/[id] — Atualiza plano
 * DELETE /api/admin/plans/[id] — Desativa (soft)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

function isAdmin(s: Awaited<ReturnType<typeof getServerSession>>) {
  return ['ADMIN', 'COMMERCIAL'].includes((s?.user as { role?: string } | undefined)?.role ?? '')
}

const patchSchema = z.object({
  name:        z.string().min(2).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  priceBrl:    z.number().positive().optional().nullable(),
  priceUsd:    z.number().positive().optional().nullable(),
  trialDays:   z.number().int().min(0).optional(),
  spendFeePct: z.number().min(0).max(100).optional().nullable(),
  features:    z.array(z.string()).optional(),
  active:      z.boolean().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const body   = await req.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

  const updated = await prisma.plan.update({
    where: { id: params.id },
    data:  parsed.data,
  }).catch(() => null)

  if (!updated) return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  await prisma.plan.update({ where: { id: params.id }, data: { active: false } }).catch(() => null)
  return NextResponse.json({ ok: true })
}
