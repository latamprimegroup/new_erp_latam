import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { CampaignPreflightStatus } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  getConciergeLinksMerged,
  getSecurityIncident,
  getWarRoomLiveConfig,
} from '@/lib/mentorado/war-room-settings'

const STATUS_PT: Record<CampaignPreflightStatus, string> = {
  [CampaignPreflightStatus.SUBMITTED]: 'Recebido — em fila para o especialista',
  [CampaignPreflightStatus.IN_ANALYSIS]: 'Em análise pelo especialista',
  [CampaignPreflightStatus.COMPLETED]: 'Checklist disponível',
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    include: { user: { select: { name: true } } },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const [liveConfig, incident, conciergeLinks, preflights, since] = await Promise.all([
    getWarRoomLiveConfig(),
    getSecurityIncident(),
    getConciergeLinksMerged(),
    prisma.campaignPreflightReview.findMany({
      where: { clientId: client.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { ticket: { select: { ticketNumber: true, status: true } } },
    }),
    Promise.resolve(new Date(Date.now() - 60 * 86400000)),
  ])

  const metrics = await prisma.creativeAdMetricsEntry.findMany({
    where: { metricDate: { gte: since } },
    select: { clientId: true, spend: true, sales: true },
  })

  const agg = new Map<string, { roiSum: number; n: number }>()
  for (const m of metrics) {
    const spend = Number(m.spend)
    const sales = Number(m.sales)
    const roi = spend > 0 ? sales / spend : 0
    const cur = agg.get(m.clientId) || { roiSum: 0, n: 0 }
    cur.roiSum += roi
    cur.n += 1
    agg.set(m.clientId, cur)
  }

  const ranked = [...agg.entries()]
    .map(([cid, v]) => ({ clientId: cid, avgRoi: v.n ? v.roiSum / v.n : 0 }))
    .filter((r) => r.avgRoi > 0)
    .sort((a, b) => b.avgRoi - a.avgRoi)
    .slice(0, 12)

  const ids = ranked.map((r) => r.clientId)
  const profiles =
    ids.length === 0
      ? []
      : await prisma.clientProfile.findMany({
          where: { id: { in: ids } },
          include: { user: { select: { name: true } } },
        })
  const nameById = new Map(profiles.map((p) => [p.id, p.user.name]))

  const mask = (name: string | null | undefined) => {
    if (!name?.trim()) return 'Mentorado'
    const p = name.trim().split(/\s+/)[0]
    return p.length <= 2 ? `${p}***` : `${p.slice(0, 1).toUpperCase()}${p.slice(1, 9).toLowerCase()}***`
  }

  const leaderboard = ranked.map((r, idx) => ({
    rank: idx + 1,
    alias: mask(nameById.get(r.clientId)),
    avgRoi: Math.round(r.avgRoi * 100) / 100,
    isYou: r.clientId === client.id,
  }))

  const myRank = ranked.findIndex((r) => r.clientId === client.id)
  const mentorAuxiliar =
    myRank >= 0 && myRank < 5 && ranked[myRank]!.avgRoi >= 1.15
      ? { active: true, label: 'Mentor auxiliar — top execução (ROI Creative Vault)' }
      : { active: false, label: null as string | null }

  return NextResponse.json({
    liveConfig,
    incident,
    conciergeLinks,
    trustLevelStars: client.trustLevelStars,
    preflights: preflights.map((p) => ({
      id: p.id,
      campaignUrl: p.campaignUrl,
      status: p.status,
      statusLabel: STATUS_PT[p.status],
      checklistJson: p.checklistJson,
      analystNotes: p.analystNotes,
      ticketNumber: p.ticket?.ticketNumber,
      ticketStatus: p.ticket?.status,
      createdAt: p.createdAt.toISOString(),
    })),
    leaderboard,
    mentorAuxiliar,
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
  })
}
