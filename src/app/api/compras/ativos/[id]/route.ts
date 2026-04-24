/**
 * PATCH /api/compras/ativos/[id] — Edita campos do ativo
 * DELETE /api/compras/ativos/[id] — Remove ativo (só se AVAILABLE | QUARANTINE | DEAD)
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { COMPRAS_WRITE_ROLES } from '@/lib/asset-privacy'
import { canManageCommercialTeam } from '@/lib/commercial-hierarchy'

const editSchema = z.object({
  displayName:  z.string().min(2).max(200).optional(),
  description:  z.string().max(5000).nullable().optional(),
  tags:         z.string().max(500).nullable().optional(),
  subCategory:  z.string().max(100).nullable().optional(),
  salePrice:    z.number().positive().optional(),
  costPrice:    z.number().positive().optional(),
  vendorRef:    z.string().max(100).nullable().optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  const canManagerMarkup = Boolean(
    session?.user?.role &&
    canManageCommercialTeam(session.user.role, session.user.cargo)
  )
  if (!session?.user?.role || (!COMPRAS_WRITE_ROLES.includes(session.user.role) && !canManagerMarkup))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const asset = await prisma.asset.findUnique({ where: { id: params.id } })
  if (!asset) return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = editSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const { costPrice, ...publicFields } = parsed.data
  const data: Record<string, unknown> = {}

  for (const [k, v] of Object.entries(publicFields)) {
    if (
      canManagerMarkup &&
      !COMPRAS_WRITE_ROLES.includes(session.user.role) &&
      !['salePrice'].includes(k)
    ) {
      continue
    }
    if (v !== undefined) data[k] = v
  }

  // costPrice só Admin ou Purchasing
  const canEditCost = ['ADMIN', 'PURCHASING'].includes(session.user.role)
  if (canEditCost && costPrice !== undefined) data.costPrice = costPrice

  const updated = await prisma.asset.update({ where: { id: params.id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['ADMIN', 'PURCHASING'].includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const asset = await prisma.asset.findUnique({ where: { id: params.id } })
  if (!asset) return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 })

  const removíveis = ['AVAILABLE', 'QUARANTINE', 'DEAD']
  if (!removíveis.includes(asset.status))
    return NextResponse.json(
      { error: `Não é possível excluir ativo com status "${asset.status}". Só é permitido excluir ativos Disponível, Quarentena ou Baixado.` },
      { status: 422 },
    )

  await prisma.assetMovement.deleteMany({ where: { assetId: params.id } })
  await prisma.asset.delete({ where: { id: params.id } })

  return NextResponse.json({ ok: true })
}
