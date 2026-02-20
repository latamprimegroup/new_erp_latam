import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

const bodySchema = z.object({
  rejectedReason: z.string().min(1, 'Motivo obrigatório para reprovação'),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(['ADMIN', 'FINANCE'])
  if (!auth.ok) return auth.response
  const session = auth.session

  const { id } = await params
  const body = await req.json()
  const { rejectedReason } = bodySchema.parse(body)

  const g2 = await prisma.productionG2.findFirst({ where: { id, deletedAt: null } })
  if (!g2) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const updated = await prisma.productionG2.update({
    where: { id },
    data: {
      status: 'REPROVADA',
      rejectedReason,
      rejectedAt: new Date(),
      approvedAt: null,
    },
    include: {
      creator: { select: { name: true } },
    },
  })

  await prisma.productionG2Log.create({
    data: {
      productionG2Id: id,
      userId: session.user!.id,
      action: 'REJECT',
      details: { rejectedReason },
    },
  })

  await audit({
    userId: session.user!.id,
    action: 'production_g2_rejected',
    entity: 'ProductionG2',
    entityId: id,
    details: { codeG2: g2.codeG2, rejectedReason },
  })

  return NextResponse.json(updated)
}
