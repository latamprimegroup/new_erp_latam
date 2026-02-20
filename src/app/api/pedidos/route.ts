import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const orders = await prisma.order.findMany({
    where: { status: { in: ['PAID', 'PENDING', 'IN_DELIVERY'] } },
    include: {
      client: { include: { user: { select: { name: true, email: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const withDelivery = await prisma.delivery.findMany({
    where: { orderId: { in: orders.map((o) => o.id) } },
  })
  const hasDelivery = new Set(withDelivery.map((d) => d.orderId))

  const available = orders.filter((o) => !hasDelivery.has(o.id))

  return NextResponse.json({ orders: available })
}
