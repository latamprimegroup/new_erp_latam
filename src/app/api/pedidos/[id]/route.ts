import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncClientLTV } from '@/lib/client-ltv'
import { audit } from '@/lib/audit'
import { notifyAdminsSaleCompleted } from '@/lib/notifications/admin-events'

const updateSchema = z.object({
  status: z.enum(['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED', 'CANCELLED']).optional(),
  accountIds: z.array(z.string()).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'COMMERCIAL', 'FINANCE', 'DELIVERER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

  try {
    const body = await req.json()
    const { status, accountIds } = updateSchema.parse(body)
    if (!status) return NextResponse.json({ error: 'Status obrigatório' }, { status: 400 })

    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: { include: { account: true } } },
    })
    if (!order) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })

    const data: { status: string; paidAt?: Date } = { status }
    if (status === 'PAID' && !order.paidAt) {
      data.paidAt = new Date()
    }

    await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data,
        include: {
          client: { include: { user: { select: { name: true, email: true } } } },
          items: { include: { account: true } },
        },
      })

      let itemsToProcess = updated.items

      if (accountIds && accountIds.length > 0 && (status === 'PAID' || status === 'IN_SEPARATION')) {
        const existingIds = new Set(updated.items.map((i) => i.accountId))
        for (const accountId of accountIds) {
          if (existingIds.has(accountId)) continue
          const account = await tx.stockAccount.findUnique({ where: { id: accountId } })
          if (!account || account.status !== 'AVAILABLE') {
            throw new Error(`Conta ${accountId} não está disponível`)
          }
          const currentCount = await tx.orderItem.count({ where: { orderId: id } })
          if (currentCount >= order.quantity) {
            throw new Error('Quantidade de contas excede o pedido')
          }
          await tx.orderItem.create({
            data: { orderId: id, accountId, quantity: 1 },
          })
          existingIds.add(accountId)
        }
        itemsToProcess = await tx.orderItem.findMany({
          where: { orderId: id },
          include: { account: true },
        })
      }

      if (status === 'PAID' && order.clientId && itemsToProcess.length > 0) {
        for (const item of itemsToProcess) {
          const acc = await tx.stockAccount.findUnique({ where: { id: item.accountId } })
          if (!acc) throw new Error(`Conta ${item.accountId} não encontrada`)
          if (acc.status !== 'AVAILABLE' && acc.status !== 'RESERVED') {
            throw new Error(`Conta ${item.accountId} não está disponível (status: ${acc.status}). Bloqueio de estoque negativo.`)
          }
          await tx.stockAccount.update({
            where: { id: item.accountId },
            data: { status: 'IN_USE', clientId: order.clientId },
          })
        }
        if (itemsToProcess.length > 0) {
          await audit({
            userId: session.user?.id,
            action: 'stock_decreased_on_order',
            entity: 'Order',
            entityId: id,
            details: { accountIds: itemsToProcess.map((i) => i.accountId), qty: itemsToProcess.length },
          })
        }
      }

      return updated
    })

    const updated = await prisma.order.findUnique({
      where: { id },
      include: {
        client: { include: { user: { select: { name: true, email: true } } } },
        items: { include: { account: true } },
      },
    })

    if (status === 'PAID' && order.clientId) {
      syncClientLTV(order.clientId).catch(console.error)
    }

    if (status === 'PAID' && updated) {
      const items = updated.items || []
      const platforms = items.map((i: { account: { platform: string } }) => i.account?.platform).filter(Boolean)
      notifyAdminsSaleCompleted(
        id,
        updated.client?.user?.name ?? null,
        items.length,
        platforms
      ).catch(console.error)
    }

    return NextResponse.json(updated)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao atualizar pedido' }, { status: 500 })
  }
}
