import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

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
  const order = await prisma.order.findUnique({ where: { id } })
  if (!order) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  if (['PAID', 'DELIVERED', 'IN_DELIVERY', 'IN_SEPARATION'].includes(order.status)) {
    return NextResponse.json({ error: 'Não é possível cancelar este status' }, { status: 400 })
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { status: 'CANCELLED' },
  })

  await audit({
    userId: session.user?.id,
    action: 'commercial_order_cancelled',
    entity: 'Order',
    entityId: id,
    details: { previousStatus: order.status },
  })

  return NextResponse.json(updated)
}
