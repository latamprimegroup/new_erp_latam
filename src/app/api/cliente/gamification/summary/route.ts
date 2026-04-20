import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  computeGamificationLifetimeTotals,
  operatorCodename,
  patentBadgeVariant,
  patentProgressFromNet,
  patentRankIndex,
  type PatentId,
} from '@/lib/cliente/gamification'

function parseLastCelebrated(raw: string | null | undefined): PatentId {
  const allowed: PatentId[] = ['RECRUTA', 'SOLDADO', 'COMANDANTE', 'GENERAL', 'SOCIO_CAOS']
  if (raw && (allowed as string[]).includes(raw)) return raw as PatentId
  return 'RECRUTA'
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    select: {
      id: true,
      gamificationLastCelebratedRank: true,
    },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const { netProfit, grossRevenue, adSpend, deductionPct } = await computeGamificationLifetimeTotals(client.id)
  const progress = patentProgressFromNet(netProfit)
  const lastCelebrated = parseLastCelebrated(client.gamificationLastCelebratedRank)
  const rankUp = patentRankIndex(progress.patentId) > patentRankIndex(lastCelebrated)

  await prisma.clientProfile.update({
    where: { id: client.id },
    data: {
      gamificationTotalNetProfitBrl: netProfit,
      gamificationRankCached: progress.patentId,
    },
  })

  return NextResponse.json({
    lifetime: {
      netProfitBrl: netProfit,
      grossRevenueBrl: grossRevenue,
      adSpendBrl: adSpend,
      deductionPct,
    },
    patent: {
      id: progress.patentId,
      nextId: progress.nextPatentId,
      xpToNextFraction: progress.progressFraction,
      rangeFloorBrl: progress.currentFloor,
      rangeCeilingBrl: progress.nextCeiling,
    },
    badgeVariant: patentBadgeVariant(progress.patentId),
    codename: operatorCodename(client.id),
    rankUp,
    previousRankId: lastCelebrated,
    newRankId: rankUp ? progress.patentId : null,
  })
}
