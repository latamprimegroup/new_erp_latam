/**
 * POST - Registrar atualização em lote de entregas
 * Input: array de { cliente (C235 ou nome), quantityContracted?, quantityDelivered?, status?: reposicao|devolucao }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { audit } from '@/lib/audit'
import { computeDeliveryStatus } from '@/lib/delivery-group-utils'
import { valorEstimadoPorConta } from '@/lib/delivery-metrics'

const itemSchema = z.object({
  cliente: z.string().min(1), // C235 ou nome
  quantityContracted: z.number().int().positive().optional(),
  quantityDelivered: z.number().int().min(0).optional(),
  status: z.enum(['reposicao', 'devolucao']).optional(),
  currency: z.string().optional(),
  accountType: z.enum(['USD', 'BRL']).optional(),
  paymentType: z.enum(['AUTOMATICO', 'MANUAL']).optional(),
})

const bodySchema = z.object({ updates: z.array(itemSchema).min(1).max(100) })

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'DELIVERER', 'COMMERCIAL']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { updates } = bodySchema.parse(body)

    const clients = await prisma.clientProfile.findMany({
      include: {
        user: { select: { name: true } },
        deliveryGroups: {
          where: { status: { not: 'CANCELADA' } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, orderId: true, currency: true, accountType: true, quantityDelivered: true, quantityContracted: true, expectedCompletionAt: true, status: true, groupNumber: true },
        },
      },
    })

    const matchClient = (cliente: string) => {
      const c = cliente.trim().toUpperCase()
      return clients.find(
        (x) =>
          x.clientCode?.toUpperCase() === c ||
          x.user?.name?.toUpperCase().includes(c) ||
          c.includes(x.clientCode ?? '')
      )
    }

    const results: Array<{ cliente: string; ok: boolean; groupId?: string; error?: string }> = []

    for (const u of updates) {
      const client = matchClient(u.cliente)
      if (!client) {
        results.push({ cliente: u.cliente, ok: false, error: 'Cliente não encontrado' })
        continue
      }

      const group = client.deliveryGroups[0]
      if (!group) {
        results.push({ cliente: u.cliente, ok: false, error: 'Nenhum grupo de entrega ativo' })
        continue
      }

      if (group.status === 'FINALIZADA') {
        results.push({ cliente: u.cliente, ok: false, error: 'Grupo já finalizado' })
        continue
      }

      if (u.status === 'devolucao') {
        const qty = u.quantityDelivered ?? group.quantityDelivered
        if (qty <= 0) {
          results.push({ cliente: u.cliente, ok: false, error: 'Sem quantidade para devolução' })
          continue
        }
        const valorPorConta = valorEstimadoPorConta(group.currency, group.accountType)
        const valueAdjusted = qty * valorPorConta

        const ret = await prisma.deliveryReturn.create({
          data: {
            deliveryId: group.id,
            quantity: qty,
            status: 'REGISTRADA',
            valueAdjusted: new Decimal(valueAdjusted),
            createdById: session.user!.id,
          },
        })

        if (group.orderId) {
          await prisma.financialEntry.create({
            data: {
              type: 'EXPENSE',
              category: 'devolucao',
              value: new Decimal(valueAdjusted),
              currency: group.currency,
              date: new Date(),
              orderId: group.orderId,
              deliveryGroupId: group.id,
              description: `Devolução ${qty} contas - ${group.groupNumber}`,
            },
          })
        }

        await prisma.deliveryGroupLog.create({
          data: {
            deliveryId: group.id,
            userId: session.user!.id,
            action: 'delivery_return_registered',
            entity: 'DeliveryReturn',
            entityId: ret.id,
            details: { quantity: qty, valueAdjusted },
          },
        })
        results.push({ cliente: u.cliente, ok: true, groupId: group.id })
        continue
      }

      if (u.status === 'reposicao') {
        const qty = Math.min(u.quantityDelivered ?? 1, group.quantityDelivered)
        await prisma.deliveryReposition.create({
          data: {
            deliveryId: group.id,
            quantity: qty,
            reason: 'OUTRO',
            status: 'SOLICITADA',
          },
        })
        const hasRep = true
        const newStatus = computeDeliveryStatus(
          group.quantityContracted,
          group.quantityDelivered,
          group.expectedCompletionAt,
          hasRep
        )
        await prisma.deliveryGroup.update({
          where: { id: group.id },
          data: { status: newStatus, lastUpdatedAt: new Date() },
        })
        results.push({ cliente: u.cliente, ok: true, groupId: group.id })
        continue
      }

      const newDelivered = u.quantityDelivered ?? group.quantityDelivered
      if (newDelivered < group.quantityDelivered) {
        results.push({ cliente: u.cliente, ok: false, error: 'Não é permitido reduzir quantidade entregue' })
        continue
      }
      if (newDelivered > (u.quantityContracted ?? group.quantityContracted)) {
        results.push({ cliente: u.cliente, ok: false, error: 'Quantidade excede contratada' })
        continue
      }

      const hasActiveReposition = await prisma.deliveryReposition.count({
        where: { deliveryId: group.id, status: { in: ['SOLICITADA', 'APROVADA'] } },
      })
      const autoStatus = computeDeliveryStatus(
        u.quantityContracted ?? group.quantityContracted,
        newDelivered,
        group.expectedCompletionAt,
        hasActiveReposition > 0
      )

      await prisma.deliveryGroup.update({
        where: { id: group.id },
        data: {
          quantityDelivered: newDelivered,
          quantityContracted: u.quantityContracted ?? group.quantityContracted,
          status: autoStatus,
          completedAt: autoStatus === 'FINALIZADA' ? new Date() : null,
          lastUpdatedAt: new Date(),
        },
      })

      await prisma.deliveryGroupLog.create({
        data: {
          deliveryId: group.id,
          userId: session.user!.id,
          action: 'delivery_group_updated',
          entity: 'DeliveryGroup',
          entityId: group.id,
          details: { quantityDelivered: newDelivered, status: autoStatus },
        },
      })

      results.push({ cliente: u.cliente, ok: true, groupId: group.id })
    }

    await audit({
      userId: session.user!.id,
      action: 'delivery_bulk_update',
      entity: 'DeliveryGroup',
      details: { updatesCount: updates.length, results },
    })

    return NextResponse.json({ ok: true, results })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao processar' }, { status: 500 })
  }
}
