import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { syncClientLTV } from '@/lib/client-ltv'
import { notifyAdminsSaleCompleted } from '@/lib/notifications/admin-events'
import { runCommercialOrderPaidBridge } from '@/lib/commercial-order-bridge'
import { computeWarrantyEndsAt } from '@/lib/order-warranty'

/** Confirma pagamento manual (S2S / caixa) com auditoria + bridge Oxygen. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL', 'FINANCE'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { account: true } },
      client: { include: { user: { select: { name: true, email: true } } } },
    },
  })
  if (!order) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  if (order.status === 'PAID' || order.status === 'DELIVERED') {
    return NextResponse.json({ error: 'Pedido já consta como pago' }, { status: 400 })
  }
  if (order.status === 'CANCELLED') {
    return NextResponse.json({ error: 'Pedido cancelado' }, { status: 400 })
  }

  const paidAt = order.paidAt ?? new Date()
  const updated = await prisma.order.update({
    where: { id },
    data: {
      status: 'PAID',
      paidAt,
      warrantyEndsAt: computeWarrantyEndsAt(paidAt, order.warrantyHours ?? 48),
    },
    include: {
      items: { include: { account: true } },
      client: { include: { user: { select: { name: true, email: true } } } },
    },
  })

  await audit({
    userId: session.user?.id,
    action: 'commercial_manual_payment_confirm',
    entity: 'Order',
    entityId: id,
    details: { previousStatus: order.status },
  })

  if (order.clientId) {
    syncClientLTV(order.clientId).catch(console.error)
  }

  const items = updated.items || []
  const platforms = items.map((i) => i.account?.platform).filter(Boolean) as string[]
  notifyAdminsSaleCompleted(
    id,
    updated.client?.user?.name ?? null,
    items.length,
    platforms
  ).catch(console.error)
  runCommercialOrderPaidBridge(id, 'manual_confirm').catch((e) => console.error('bridge', e))

  return NextResponse.json(updated)
}
