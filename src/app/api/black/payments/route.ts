import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { processSurvived24h } from '@/lib/black-payment'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const isPlugPlay = session.user?.role === 'PLUG_PLAY'
  const isAdmin = session.user?.role === 'ADMIN'
  if (!isPlugPlay && !isAdmin) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const where: { collaboratorId?: string } = {}
  if (isPlugPlay) where.collaboratorId = session.user!.id!

  const payments = await prisma.blackPayment.findMany({
    where,
    include: {
      operation: { select: { id: true, niche: true, wentLiveAt: true, status: true } },
      collaborator: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const totalPending = payments.filter((p) => p.status === 'PENDING').reduce((s, p) => s + Number(p.amount), 0)
  const totalPaid = payments.filter((p) => p.status === 'PAID').reduce((s, p) => s + Number(p.amount), 0)

  return NextResponse.json({
    payments,
    summary: { totalPending, totalPaid, countPending: payments.filter((p) => p.status === 'PENDING').length },
  })
}

/**
 * Admin: processa sobreviventes 24h e retorna quantos pagamentos foram criados
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const created = await processSurvived24h()
  return NextResponse.json({ processed: created })
}
