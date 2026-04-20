import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** Solicitações pendentes / em andamento (reposição, pedidos customizados). */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const rows = await prisma.accountSolicitation.findMany({
    where: { status: { in: ['pending', 'in_progress'] } },
    orderBy: { createdAt: 'asc' },
    take: 100,
    include: {
      client: { include: { user: { select: { name: true, email: true, phone: true } } } },
    },
  })

  return NextResponse.json({
    items: rows.map((s) => ({
      id: s.id,
      status: s.status,
      quantity: s.quantity,
      product: s.product,
      accountType: s.accountType,
      country: s.country,
      referenceOrderId: s.referenceOrderId,
      notes: s.notes,
      createdAt: s.createdAt.toISOString(),
      clientName: s.client.user.name || s.client.user.email,
      clientEmail: s.client.user.email,
      clientPhone: s.client.user.phone,
    })),
  })
}
