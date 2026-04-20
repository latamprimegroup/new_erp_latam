import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const GATEKEEPER = ['AWAITING_PAYMENT', 'PENDING', 'APPROVED'] as const

/** Fila gatekeeper + pedidos recentes — ADMIN / COMERCIAL. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const tab = searchParams.get('tab') || 'gatekeeper'

  if (tab === 'gatekeeper') {
    const queue = await prisma.order.findMany({
      where: { status: { in: [...GATEKEEPER] } },
      include: {
        client: {
          select: {
            id: true,
            user: { select: { name: true, email: true, phone: true } },
          },
        },
        seller: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })
    return NextResponse.json({ tab: 'gatekeeper', orders: queue })
  }

  const recent = await prisma.order.findMany({
    include: {
      client: {
        select: { id: true, user: { select: { name: true, email: true, phone: true } } },
      },
      seller: { select: { name: true, email: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 60,
  })
  return NextResponse.json({ tab: 'recent', orders: recent })
}
