import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const logs = await prisma.commercialContactLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 80,
    include: {
      client: { include: { user: { select: { name: true, email: true } } } },
      user: { select: { name: true, email: true } },
    },
  })

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      createdAt: l.createdAt.toISOString(),
      channel: l.channel,
      orderId: l.orderId,
      clientName: l.client.user.name || l.client.user.email,
      clientEmail: l.client.user.email,
      by: l.user.name || l.user.email,
    })),
  })
}
