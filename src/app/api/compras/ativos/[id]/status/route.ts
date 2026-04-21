/**
 * PATCH /api/compras/ativos/[id]/status
 * Máquina de estados do ativo — com log de movimentação e validação de transição.
 *
 * Transições permitidas:
 *   AVAILABLE       → QUARANTINE | SOLD | DEAD
 *   QUARANTINE      → AVAILABLE | DEAD
 *   SOLD            → AWAITING_VENDOR
 *   AWAITING_VENDOR → RECEIVED
 *   RECEIVED        → TRIAGEM
 *   TRIAGEM         → DELIVERED | DEAD
 *   DEAD            → (terminal)
 *   DELIVERED       → (terminal)
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { COMPRAS_WRITE_ROLES } from '@/lib/asset-privacy'
import type { AssetStatus } from '@prisma/client'

const TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  AVAILABLE:       ['QUARANTINE', 'SOLD', 'DEAD'],
  QUARANTINE:      ['AVAILABLE', 'DEAD'],
  SOLD:            ['AWAITING_VENDOR'],
  AWAITING_VENDOR: ['RECEIVED'],
  RECEIVED:        ['TRIAGEM'],
  TRIAGEM:         ['DELIVERED', 'DEAD'],
  DELIVERED:       [],
  DEAD:            [],
}

const patchSchema = z.object({
  status: z.enum(['AVAILABLE','QUARANTINE','SOLD','AWAITING_VENDOR','RECEIVED','TRIAGEM','DELIVERED','DEAD']),
  reason: z.string().max(500).optional(),
})

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !COMPRAS_WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const asset = await prisma.asset.findUnique({ where: { id: params.id } })
  if (!asset) return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })

  const { status: newStatus, reason } = parsed.data
  const allowed = TRANSITIONS[asset.status] ?? []

  if (!allowed.includes(newStatus))
    return NextResponse.json({
      error: `Transição inválida: ${asset.status} → ${newStatus}. Permitidas: ${allowed.join(', ') || 'nenhuma'}`,
    }, { status: 422 })

  const now = new Date()
  const dateFields: Partial<{ soldAt: Date; receivedAt: Date; deliveredAt: Date }> = {}
  if (newStatus === 'SOLD')      dateFields.soldAt      = now
  if (newStatus === 'RECEIVED')  dateFields.receivedAt  = now
  if (newStatus === 'DELIVERED') dateFields.deliveredAt = now

  const [updated] = await Promise.all([
    prisma.asset.update({
      where: { id: params.id },
      data:  { status: newStatus, ...dateFields },
    }),
    prisma.assetMovement.create({
      data: {
        assetId:    params.id,
        fromStatus: asset.status,
        toStatus:   newStatus,
        reason:     reason ?? `Mudança de status por ${session.user.email}`,
        userId:     session.user.id,
      },
    }),
  ])

  return NextResponse.json(updated)
}
