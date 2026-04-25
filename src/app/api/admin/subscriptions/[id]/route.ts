/**
 * PATCH  /api/admin/subscriptions/[id] — Atualiza status / próximo ciclo
 * DELETE /api/admin/subscriptions/[id] — Cancela (soft)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

function isAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  const role = (session?.user as { role?: string } | undefined)?.role
  return role === 'ADMIN' || role === 'COMMERCIAL'
}

const patchSchema = z.object({
  status:         z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED']).optional(),
  nextBillingAt:  z.string().optional().nullable(),
  amount:         z.number().positive().optional(),
  notes:          z.string().optional().nullable(),
  gateway:        z.string().optional(),
  externalPlanId: z.string().optional().nullable(),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const body   = await req.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 })
  }

  const d = parsed.data
  const cancelledAt = d.status === 'CANCELLED' ? new Date() : undefined

  const updated = await prisma.subscription.update({
    where: { id: params.id },
    data: {
      ...(d.status        ? { status: d.status }                         : {}),
      ...(cancelledAt     ? { cancelledAt }                               : {}),
      ...(d.nextBillingAt ? { nextBillingAt: new Date(d.nextBillingAt) } : {}),
      ...(d.amount        ? { amount: d.amount }                         : {}),
      ...(d.notes !== undefined ? { notes: d.notes }                    : {}),
      ...(d.gateway       ? { gateway: d.gateway }                       : {}),
      ...(d.externalPlanId !== undefined ? { externalPlanId: d.externalPlanId } : {}),
    },
  }).catch(() => null)

  if (!updated) return NextResponse.json({ error: 'Assinatura não encontrada' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  await prisma.subscription.update({
    where: { id: params.id },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  }).catch(() => null)

  return NextResponse.json({ ok: true })
}
