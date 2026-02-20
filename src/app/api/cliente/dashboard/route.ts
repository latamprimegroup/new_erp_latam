import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Perfil de cliente não encontrado' }, { status: 404 })

  const [ordersTotal, ordersApproved, ordersPending, ordersRejected, availableCount] = await Promise.all([
    prisma.order.count({ where: { clientId: client.id } }),
    prisma.order.count({ where: { clientId: client.id, status: 'DELIVERED' } }),
    prisma.order.count({ where: { clientId: client.id, status: { in: ['PENDING', 'PAID', 'IN_DELIVERY'] } } }),
    prisma.order.count({ where: { clientId: client.id, status: 'REJECTED' } }),
    prisma.stockAccount.count({ where: { status: 'AVAILABLE' } }),
  ])

  return NextResponse.json({
    comprasTotal: ordersTotal,
    comprasAprovadas: ordersApproved,
    comprasPendentes: ordersPending,
    comprasRejeitadas: ordersRejected,
    contasDisponiveis: availableCount,
  })
}
