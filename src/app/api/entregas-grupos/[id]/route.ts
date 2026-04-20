import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { computeDeliveryStatus } from '@/lib/delivery-group-utils'
import { getGroupMetrics } from '@/lib/delivery-metrics'
import { notifyDeliveryGroupProgress } from '@/lib/notifications/delivery-tracker'

const bottleneckEnum = z.enum([
  'AGUARDANDO_PRODUCAO',
  'AGUARDANDO_URL',
  'PRODUCAO_EM_ANDAMENTO',
  'AGUARDANDO_CLIENTE',
  'EM_VALIDACAO',
  'NENHUM',
])

const updateSchema = z.object({
  quantityDelivered: z.number().int().min(0).optional(),
  status: z.enum([
    'AGUARDANDO_INICIO', 'EM_ANDAMENTO', 'PARCIALMENTE_ENTREGUE',
    'FINALIZADA', 'ATRASADA', 'EM_REPOSICAO', 'CANCELADA',
  ]).optional(),
  expectedCompletionAt: z.string().optional().nullable(),
  observacoesProducao: z.string().max(8000).optional().nullable(),
  operationalBottleneck: bottleneckEnum.optional(),
  trackerUrgent: z.boolean().optional(),
})

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'DELIVERER', 'COMMERCIAL', 'PRODUCER', 'PRODUCTION_MANAGER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const delivery = await prisma.deliveryGroup.findUnique({
    where: { id },
    include: {
      client: { include: { user: { select: { name: true, email: true } } } },
      responsible: { select: { name: true, email: true } },
      order: { select: { id: true, product: true, quantity: true, paidAt: true } },
      repositions: {
        include: { analyst: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      },
      returns: { orderBy: { createdAt: 'desc' } },
      logs: {
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  })

  if (!delivery) return NextResponse.json({ error: 'Entrega não encontrada' }, { status: 404 })

  const pending = Math.max(0, delivery.quantityContracted - delivery.quantityDelivered)
  const progressPercent = delivery.quantityContracted > 0
    ? Math.round((delivery.quantityDelivered / delivery.quantityContracted) * 100)
    : 0

  const metrics = await getGroupMetrics(id)

  return NextResponse.json({
    ...delivery,
    quantityPending: pending,
    progressPercent,
    metrics,
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'DELIVERER', 'COMMERCIAL', 'PRODUCER', 'PRODUCTION_MANAGER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const delivery = await prisma.deliveryGroup.findUnique({
    where: { id },
    include: { repositions: { where: { status: { in: ['SOLICITADA', 'APROVADA'] } } } },
  })

  if (!delivery) return NextResponse.json({ error: 'Entrega não encontrada' }, { status: 404 })

  if (delivery.status === 'FINALIZADA') {
    return NextResponse.json({ error: 'Não é possível editar entrega finalizada' }, { status: 400 })
  }

  try {
    const body = await req.json()
    const data = updateSchema.parse(body)

    const updateData: Record<string, unknown> = {}
    const previousDelivered = delivery.quantityDelivered

    if (data.quantityDelivered !== undefined) {
      if (data.quantityDelivered < delivery.quantityDelivered) {
        return NextResponse.json(
          { error: 'Não é permitido reduzir a quantidade entregue' },
          { status: 400 }
        )
      }
      if (data.quantityDelivered > delivery.quantityContracted) {
        return NextResponse.json(
          { error: 'Quantidade entregue não pode ser maior que a contratada' },
          { status: 400 }
        )
      }
      updateData.quantityDelivered = data.quantityDelivered
    }

    if (data.expectedCompletionAt !== undefined) {
      updateData.expectedCompletionAt = data.expectedCompletionAt
        ? new Date(data.expectedCompletionAt)
        : null
    }

    if (data.observacoesProducao !== undefined) {
      updateData.observacoesProducao = data.observacoesProducao
    }
    if (data.operationalBottleneck !== undefined) {
      updateData.operationalBottleneck = data.operationalBottleneck
    }
    if (data.trackerUrgent !== undefined) {
      updateData.trackerUrgent = data.trackerUrgent
    }

    if (data.status !== undefined) {
      const pending = delivery.quantityContracted - (data.quantityDelivered ?? delivery.quantityDelivered)
      if (data.status === 'FINALIZADA' && pending > 0) {
        return NextResponse.json(
          { error: 'Não é possível finalizar com quantidade pendente' },
          { status: 400 }
        )
      }
      updateData.status = data.status
      if (data.status === 'FINALIZADA') {
        updateData.completedAt = new Date()
      }
    } else if (Object.keys(updateData).length > 0) {
      const newDelivered = (updateData.quantityDelivered as number) ?? delivery.quantityDelivered
      const hasActiveReposition = delivery.repositions.length > 0
      const autoStatus = computeDeliveryStatus(
        delivery.quantityContracted,
        newDelivered,
        (updateData.expectedCompletionAt as Date) ?? delivery.expectedCompletionAt,
        hasActiveReposition
      )
      updateData.status = autoStatus
      if (autoStatus === 'FINALIZADA') updateData.completedAt = new Date()
    }

    if (Object.keys(updateData).length > 0) {
      updateData.lastUpdatedAt = new Date()
    }

    const updated = await prisma.deliveryGroup.update({
      where: { id },
      data: updateData,
      include: {
        client: { include: { user: { select: { name: true, email: true } } } },
        responsible: { select: { name: true } },
      },
    })

    await prisma.deliveryGroupLog.create({
      data: {
        deliveryId: id,
        userId: session.user.id,
        action: 'delivery_group_updated',
        entity: 'DeliveryGroup',
        entityId: id,
        details: updateData as Prisma.InputJsonValue,
      },
    })

    await audit({
      userId: session.user.id,
      action: 'delivery_group_updated',
      entity: 'DeliveryGroup',
      entityId: id,
      details: { changes: Object.keys(updateData) },
    })

    if (
      data.quantityDelivered !== undefined &&
      updated.quantityDelivered > previousDelivered
    ) {
      await notifyDeliveryGroupProgress(id, previousDelivered, updated.quantityDelivered).catch(() => {})
    }

    return NextResponse.json({
      ...updated,
      quantityPending: updated.quantityContracted - updated.quantityDelivered,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}
