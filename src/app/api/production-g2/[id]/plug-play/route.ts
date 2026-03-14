import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

/**
 * PATCH - Marcar/desmarcar "Primeira Campanha White Aprovada" (Plug & Play)
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER', 'FINANCE'])
  if (!auth.ok) return auth.response

  const { id } = await params
  const g2 = await prisma.productionG2.findFirst({
    where: { id, deletedAt: null },
  })
  if (!g2) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  if (['REPROVADA', 'ARQUIVADA'].includes(g2.status)) {
    return NextResponse.json({ error: 'Conta reprovada ou arquivada' }, { status: 400 })
  }

  const body = await req.json()
  const firstCampaignWhiteApproved = Boolean(body.firstCampaignWhiteApproved)

  await prisma.productionG2.update({
    where: { id },
    data: { firstCampaignWhiteApproved },
  })

  return NextResponse.json({ ok: true, firstCampaignWhiteApproved })
}
