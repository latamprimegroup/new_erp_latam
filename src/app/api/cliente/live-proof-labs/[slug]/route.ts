import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { mergeDetail, toClientListItem } from '@/lib/live-proof-labs/serialize'

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const { slug } = await ctx.params
  const since7 = new Date()
  since7.setUTCDate(since7.getUTCDate() - 7)
  since7.setUTCHours(0, 0, 0, 0)

  const row = await prisma.liveProofLabCase.findFirst({
    where: {
      slug,
      publishedToClients: true,
      status: { in: ['EM_TESTE', 'VALIDADA', 'REPROVADA', 'EM_ESCALA'] },
    },
    include: {
      screenshots: { orderBy: { sortOrder: 'asc' } },
      insights: { orderBy: { sortOrder: 'asc' } },
      spendDays: {
        where: { day: { gte: since7 } },
        orderBy: { day: 'asc' },
      },
    },
  })
  if (!row) return NextResponse.json({ error: 'Caso não encontrado' }, { status: 404 })

  const base = await toClientListItem(row)
  const detail = mergeDetail(base, row, row.screenshots, row.insights, row.spendDays)

  return NextResponse.json({ case: detail })
}
