/**
 * Relatório de Gargalos
 */
import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const refDate = new Date()
  refDate.setHours(0, 0, 0, 0)

  const report = await prisma.bottleneckReport.findUnique({
    where: { referenceDate: refDate },
  })

  if (!report) {
    return NextResponse.json({
      referenceDate: refDate,
      etapaMaisDemora: null,
      setorMaiorErro: null,
      colaboradorRetrabalho: null,
      tipoContaReprovacao: null,
      clienteMaiorReposicao: null,
      details: null,
      message: 'Execute o cron de métricas para gerar o relatório',
    })
  }

  const collaborator = report.colaboradorRetrabalho
    ? await prisma.user.findUnique({
        where: { id: report.colaboradorRetrabalho },
        select: { name: true, email: true },
      })
    : null

  return NextResponse.json({
    ...report,
    colaboradorRetrabalhoNome: collaborator?.name ?? report.colaboradorRetrabalho,
  })
}
