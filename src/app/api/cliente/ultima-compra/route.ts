import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const lastOrder = await prisma.order.findFirst({
    where: { clientId: client.id, status: 'DELIVERED' },
    orderBy: { paidAt: 'desc' },
  })

  if (!lastOrder) {
    return NextResponse.json({ lastPurchase: null })
  }

  return NextResponse.json({
    lastPurchase: {
      id: lastOrder.id,
      product: lastOrder.product,
      accountType: lastOrder.accountType,
      quantity: lastOrder.quantity,
      value: Number(lastOrder.value),
      country: lastOrder.country,
      paidAt: lastOrder.paidAt,
    },
  })
}
