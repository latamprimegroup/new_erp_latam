import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeGamificationLifetimeTotals, patentFromNetProfit } from '@/lib/cliente/gamification'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const { netProfit } = await computeGamificationLifetimeTotals(client.id)
  const current = patentFromNetProfit(netProfit)

  await prisma.clientProfile.update({
    where: { id: client.id },
    data: { gamificationLastCelebratedRank: current },
  })

  return NextResponse.json({ ok: true, celebratedRankId: current })
}
