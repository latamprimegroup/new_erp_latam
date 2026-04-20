import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** Detalhe de um pedido — só se pertencer ao cliente (recompra / recibo). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })

  const order = await prisma.order.findFirst({
    where: { id, clientId: client.id },
    select: {
      id: true,
      product: true,
      accountType: true,
      quantity: true,
      value: true,
      country: true,
      status: true,
      createdAt: true,
      paidAt: true,
    },
  })

  if (!order) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })

  return NextResponse.json({
    ...order,
    value: Number(order.value),
  })
}
