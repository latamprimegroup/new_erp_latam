import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getClientLTV } from '@/lib/client-ltv'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'COMMERCIAL']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'ID do cliente obrigatório' }, { status: 400 })

  const [ltv, metrics] = await Promise.all([
    getClientLTV(id),
    prisma.customerMetrics.findUnique({ where: { clientId: id } }),
  ])
  if (!ltv) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  return NextResponse.json({
    ...ltv,
    metricas: metrics
      ? {
          receitaBrutaTotal: Number(metrics.revenueTotal),
          custoTotal: Number(metrics.costTotal),
          margemReal: Number(metrics.marginTotal),
          ticketMedio: Number(metrics.ticketMedio),
          tempoRelacionamentoDias: metrics.tempoRelacionamentoDias,
          ltvBruto: Number(metrics.ltvBruto),
          ltvLiquido: Number(metrics.ltvLiquido),
          ltvReal: Number(metrics.ltvReal),
          ltvProjetado3m: metrics.ltvProjetado3m != null ? Number(metrics.ltvProjetado3m) : null,
          ltvProjetado6m: metrics.ltvProjetado6m != null ? Number(metrics.ltvProjetado6m) : null,
          ltvProjetado12m: metrics.ltvProjetado12m != null ? Number(metrics.ltvProjetado12m) : null,
          cac: metrics.cac != null ? Number(metrics.cac) : null,
          ltvCacRatio: metrics.ltvCacRatio != null ? Number(metrics.ltvCacRatio) : null,
          paybackMeses: metrics.paybackMeses != null ? Number(metrics.paybackMeses) : null,
          churnProbability: metrics.churnProbability != null ? Number(metrics.churnProbability) : null,
          churnRisk: metrics.churnRisk,
          segmento: metrics.segmento,
          scoreValor: metrics.scoreValor,
          scoreRisco: metrics.scoreRisco,
          scoreFidelidade: metrics.scoreFidelidade,
          diasSemCompra: metrics.diasSemCompra,
          churnFlag: metrics.churnFlag,
        }
      : null,
  })
}
