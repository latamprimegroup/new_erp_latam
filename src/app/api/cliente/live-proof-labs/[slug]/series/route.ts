import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { trackerDaySeriesForOffer } from '@/lib/live-proof-labs/metrics'

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const { slug } = await ctx.params
  const row = await prisma.liveProofLabCase.findFirst({
    where: {
      slug,
      publishedToClients: true,
      status: { in: ['EM_TESTE', 'VALIDADA', 'REPROVADA', 'EM_ESCALA'] },
    },
    select: { internalTrackerOfferId: true },
  })
  if (!row?.internalTrackerOfferId) {
    return NextResponse.json({ series: null, message: 'Sem oferta tracker ligada — gráfico indisponível.' })
  }

  const url = new URL(req.url)
  const days = Math.min(90, Math.max(7, Number(url.searchParams.get('days')) || 14))

  const series = await trackerDaySeriesForOffer(row.internalTrackerOfferId, days)
  return NextResponse.json({ series })
}
