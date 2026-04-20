import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncDeliveryGroupQuantityFromAccounts } from '@/lib/delivery-group-sync-quantity'
import { notifyDeliveryGroupProgress } from '@/lib/notifications/delivery-tracker'

/**
 * Recalcula quantityDelivered a partir de ProductionG2 + StockAccount entregues.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'DELIVERER', 'COMMERCIAL', 'PRODUCER', 'PRODUCTION_MANAGER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const before = await prisma.deliveryGroup.findUnique({
    where: { id },
    select: { quantityDelivered: true },
  })
  if (!before) return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 })

  const result = await syncDeliveryGroupQuantityFromAccounts(id)
  if (result.quantityDelivered > before.quantityDelivered) {
    await notifyDeliveryGroupProgress(id, before.quantityDelivered, result.quantityDelivered).catch(() => {})
  }

  return NextResponse.json(result)
}
