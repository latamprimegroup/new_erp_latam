import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { computeDeliveryStatus } from '@/lib/delivery-group-utils'

const patchSchema = z.object({
  status: z.enum(['APROVADA', 'NEGADA', 'CONCLUIDA']),
  notes: z.string().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; reposicaoId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'DELIVERER', 'COMMERCIAL']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id, reposicaoId } = await params
  const reposition = await prisma.deliveryReposition.findFirst({
    where: { id: reposicaoId, deliveryId: id },
    include: { delivery: true },
  })

  if (!reposition) return NextResponse.json({ error: 'Reposição não encontrada' }, { status: 404 })
  if (reposition.status === 'CONCLUIDA' || reposition.status === 'NEGADA') {
    return NextResponse.json({ error: 'Reposição já foi tratada' }, { status: 400 })
  }

  try {
    const body = await req.json()
    const data = patchSchema.parse(body)

    const updated = await prisma.deliveryReposition.update({
      where: { id: reposicaoId },
      data: {
        status: data.status,
        analystId: session.user.id,
        resolvedAt: new Date(),
        notes: data.notes || null,
      },
    })

    const hasOtherOpen = await prisma.deliveryReposition.count({
      where: {
        deliveryId: id,
        id: { not: reposicaoId },
        status: { in: ['SOLICITADA', 'APROVADA'] },
      },
    })

    if (hasOtherOpen === 0) {
      const newStatus = computeDeliveryStatus(
        reposition.delivery.quantityContracted,
        reposition.delivery.quantityDelivered,
        reposition.delivery.expectedCompletionAt,
        false
      )
      await prisma.deliveryGroup.update({
        where: { id },
        data: { status: newStatus },
      })
    }

    await prisma.deliveryGroupLog.create({
      data: {
        deliveryId: id,
        userId: session.user.id,
        action: 'reposition_status_updated',
        entity: 'DeliveryReposition',
        entityId: reposicaoId,
        details: { status: data.status },
      },
    })

    await audit({
      userId: session.user.id,
      action: 'reposition_approved',
      entity: 'DeliveryReposition',
      entityId: reposicaoId,
      details: { status: data.status },
    })

    return NextResponse.json(updated)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}
