/**
 * Score Operacional por Colaborador - API
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER'])
  if (!auth.ok) return auth.response

  const setor = req.nextUrl.searchParams.get('setor') || 'PRODUCAO'
  const refDate = new Date()
  refDate.setHours(0, 0, 0, 0)

  const scores = await prisma.operatorScore.findMany({
    where: { referenceDate: refDate, setor },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { rankingMes: 'asc' },
  })

  return NextResponse.json({
    setor,
    referenceDate: refDate,
    ranking: scores.map((s) => ({
      userId: s.userId,
      name: s.user.name,
      email: s.user.email,
      producaoDiaria: s.producaoDiaria,
      producaoMensal: s.producaoMensal,
      metaMensal: s.metaMensal,
      taxaAprovacao: s.taxaAprovacao != null ? Number(s.taxaAprovacao) : null,
      taxaReprovacao: s.taxaReprovacao != null ? Number(s.taxaReprovacao) : null,
      tempoMedioTarefa: s.tempoMedioTarefa,
      scoreProdutividade: s.scoreProdutividade,
      scoreQualidade: s.scoreQualidade,
      scoreGeral: s.scoreGeral,
      rankingMes: s.rankingMes,
    })),
  })
}
