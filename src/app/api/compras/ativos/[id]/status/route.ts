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
 *   TRIAGEM         → AVAILABLE | DELIVERED | DEAD   ← TRIAGEM→AVAILABLE: Gerente libera para venda
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

// COMMERCIAL pode marcar como SOLD; PRODUCTION_MANAGER pode liberar TRIAGEM→AVAILABLE
const COMMERCIAL_SELL_ROLES = [...COMPRAS_WRITE_ROLES, 'COMMERCIAL', 'PRODUCTION_MANAGER']

const TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  AVAILABLE:       ['QUARANTINE', 'SOLD', 'DEAD'],
  QUARANTINE:      ['AVAILABLE', 'DEAD'],
  SOLD:            ['AWAITING_VENDOR'],
  AWAITING_VENDOR: ['RECEIVED'],
  RECEIVED:        ['TRIAGEM'],
  TRIAGEM:         ['AVAILABLE', 'DELIVERED', 'DEAD'],
  DELIVERED:       [],
  DEAD:            [],
}

const patchSchema = z.object({
  status:    z.enum(['AVAILABLE','QUARANTINE','SOLD','AWAITING_VENDOR','RECEIVED','TRIAGEM','DELIVERED','DEAD']),
  reason:    z.string().max(500).optional(),
  buyerName: z.string().max(200).optional(),
})

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const role = session?.user?.role ?? ''
  if (!role || !COMMERCIAL_SELL_ROLES.includes(role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const asset = await prisma.asset.findUnique({ where: { id: params.id } })
  if (!asset) return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })

  const { status: newStatus, reason, buyerName } = parsed.data
  const allowed = TRANSITIONS[asset.status] ?? []

  // COMMERCIAL só pode fazer AVAILABLE → SOLD
  if (role === 'COMMERCIAL' && newStatus !== 'SOLD')
    return NextResponse.json({ error: 'Comercial só pode registrar vendas (SOLD).' }, { status: 403 })

  // PRODUCTION_MANAGER só pode fazer TRIAGEM → AVAILABLE
  if (role === 'PRODUCTION_MANAGER' && !(asset.status === 'TRIAGEM' && newStatus === 'AVAILABLE'))
    return NextResponse.json({ error: 'Gerente de Produção só pode liberar ativos de Triagem para Disponível.' }, { status: 403 })

  if (!allowed.includes(newStatus))
    return NextResponse.json({
      error: `Transição inválida: ${asset.status} → ${newStatus}. Permitidas: ${allowed.join(', ') || 'nenhuma'}`,
    }, { status: 422 })

  const now = new Date()
  const dateFields: Partial<{ soldAt: Date; receivedAt: Date; deliveredAt: Date }> = {}
  if (newStatus === 'SOLD')      dateFields.soldAt      = now
  if (newStatus === 'RECEIVED')  dateFields.receivedAt  = now
  if (newStatus === 'DELIVERED') dateFields.deliveredAt = now

  const userEmail = session?.user?.email ?? 'sistema'
  const userId   = session?.user?.id    ?? ''

  const movementReason = newStatus === 'SOLD' && buyerName
    ? `Vendido para: ${buyerName}${reason ? ` — ${reason}` : ''}`
    : reason ?? `Mudança de status por ${userEmail}`

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
        reason:     movementReason,
        userId,
      },
    }),
  ])

  return NextResponse.json(updated)
}
