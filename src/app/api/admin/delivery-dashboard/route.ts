/**
 * Dashboard Inteligente de Entregas
 * Resumo geral, ranking, alertas
 */
import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getGroupMetrics } from '@/lib/delivery-metrics'

export async function GET() {
  const auth = await requireRoles(['ADMIN', 'DELIVERER', 'COMMERCIAL'])
  if (!auth.ok) return auth.response

  const groups = await prisma.deliveryGroup.findMany({
    where: { status: { not: 'CANCELADA' } },
    include: {
      client: { include: { user: { select: { name: true } }, metrics: true } },
      order: { select: { value: true, currency: true } },
    },
  })

  const emAndamento = groups.filter((g) =>
    ['AGUARDANDO_INICIO', 'EM_ANDAMENTO', 'PARCIALMENTE_ENTREGUE', 'EM_REPOSICAO'].includes(g.status)
  ).length
  const concluidas = groups.filter((g) => g.status === 'FINALIZADA').length
  const atrasadas = groups.filter((g) => g.status === 'ATRASADA').length
  const reposicoes = await prisma.deliveryReposition.count({
    where: { status: { in: ['SOLICITADA', 'APROVADA'] } },
  })
  const openRepositionGroupIds = await prisma.deliveryReposition.findMany({
    where: { status: { in: ['SOLICITADA', 'APROVADA'] } },
    select: { deliveryId: true },
    distinct: ['deliveryId'],
  })
  const gruposComReposicaoAberta = new Set(openRepositionGroupIds.map((r) => r.deliveryId))
  const devolucoes = await prisma.deliveryReturn.count()

  const totalContracted = groups.reduce((s, g) => s + g.quantityContracted, 0)
  const totalDelivered = groups.reduce((s, g) => s + g.quantityDelivered, 0)
  const percentualMedio = totalContracted > 0 ? (totalDelivered / totalContracted) * 100 : 0

  const metricsPromises = groups.map((g) => getGroupMetrics(g.id))
  const metricsResults = await Promise.all(metricsPromises)

  const withMetrics = groups.map((g, i) => ({
    ...g,
    metrics: metricsResults[i],
  }))

  const receitaPendente = withMetrics.reduce((s, g) => s + (g.metrics?.receitaPendente ?? 0), 0)
  // Alinhado ao wireframe: atraso operacional, risco médio/alto ou reposição aberta (cancelamento/reembolso).
  const receitaEmRisco = withMetrics
    .filter(
      (g) =>
        g.metrics?.riscoOperacional === 'ALTO' ||
        g.metrics?.riscoOperacional === 'MEDIO' ||
        gruposComReposicaoAberta.has(g.id)
    )
    .reduce((s, g) => s + (g.metrics?.receitaPendente ?? 0), 0)

  const porSaldoPendente = [...withMetrics]
    .filter((g) => (g.metrics?.receitaPendente ?? 0) > 0)
    .sort((a, b) => (b.metrics?.receitaPendente ?? 0) - (a.metrics?.receitaPendente ?? 0))
    .slice(0, 10)

  const porPrioridade = [...withMetrics]
    .filter((g) => ['AGUARDANDO_INICIO', 'EM_ANDAMENTO', 'PARCIALMENTE_ENTREGUE', 'ATRASADA', 'EM_REPOSICAO'].includes(g.status))
    .sort((a, b) => (b.metrics?.priorityScore ?? 0) - (a.metrics?.priorityScore ?? 0))
    .slice(0, 10)

  const porAtraso = groups
    .filter((g) => g.status === 'ATRASADA')
    .sort((a, b) => {
      const da = a.expectedCompletionAt?.getTime() ?? 0
      const db = b.expectedCompletionAt?.getTime() ?? 0
      return da - db
    })
    .slice(0, 10)

  const tempos = groups
    .filter((g) => g.completedAt && g.groupCreatedAt)
    .map((g) => (g.completedAt!.getTime() - g.groupCreatedAt.getTime()) / (24 * 60 * 60 * 1000))
  const tempoMedioEntrega = tempos.length > 0 ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0

  const alertas: Array<{ type: string; message: string; groupId?: string }> = []
  for (const g of withMetrics) {
    if (g.metrics && g.metrics.percentualConclusao < 30 && g.metrics.diasAberto > 14) {
      alertas.push({
        type: 'ENTREGA_ABAIXO_30',
        message: `${g.groupNumber}: apenas ${g.metrics.percentualConclusao.toFixed(0)}% após ${g.metrics.diasAberto} dias`,
        groupId: g.id,
      })
    }
  }

  return NextResponse.json({
    resumo: {
      emAndamento,
      concluidas,
      atrasadas,
      reposicoes,
      devolucoes,
      receitaPendente,
      receitaEmRisco,
      percentualMedioConclusao: Math.round(percentualMedio),
      tempoMedioEntregaDias: tempoMedioEntrega,
    },
    rankingPorSaldoPendente: porSaldoPendente.map((g) => ({
      id: g.id,
      groupNumber: g.groupNumber,
      clientName: g.client?.user?.name,
      receitaPendente: g.metrics?.receitaPendente,
      percentualConclusao: g.metrics?.percentualConclusao,
    })),
    rankingPorPrioridade: porPrioridade.map((g) => ({
      id: g.id,
      groupNumber: g.groupNumber,
      clientName: g.client?.user?.name,
      priorityScore: g.metrics?.priorityScore,
    })),
    rankingPorAtraso: porAtraso.map((g) => ({
      groupNumber: g.groupNumber,
      clientName: g.client?.user?.name,
      expectedCompletionAt: g.expectedCompletionAt,
    })),
    alertas,
  })
}
