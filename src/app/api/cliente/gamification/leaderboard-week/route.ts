import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeWeeklyLeaderboardByRoi } from '@/lib/cliente/gamification'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const rows = await computeWeeklyLeaderboardByRoi({ limit: 10, viewerClientId: client.id })

  return NextResponse.json({
    disclaimer:
      'Ranking semanal (UTC, últimos 7 dias): ROI % real = (receita tracker após dedução − gasto Creative Vault) ÷ gasto. Só aparecem operadores com gasto > 0. Codinomes anónimos; nicho = operação registada no perfil.',
    rows,
  })
}
