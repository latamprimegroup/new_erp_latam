/**
 * Métricas e Score de Prioridade para Entregas
 */
import { prisma } from '@/lib/prisma'

const VALOR_POR_CONTA_USD = 150
const VALOR_POR_CONTA_BRL = 800

export function calcPriorityScore(params: {
  valorFinanceiro: number
  diasAberto: number
  percentualConclusao: number
  isVip: boolean
  churnRisk: number
  isAtrasado: boolean
}): number {
  let score = 50
  if (params.valorFinanceiro > 5000) score += 15
  else if (params.valorFinanceiro > 2000) score += 10
  if (params.diasAberto > 30) score += 15
  else if (params.diasAberto > 14) score += 8
  if (params.percentualConclusao < 30 && params.diasAberto > 7) score += 10
  if (params.isVip) score += 10
  if (params.churnRisk > 50) score += 10
  if (params.isAtrasado) score += 15
  return Math.min(100, score)
}

export function valorEstimadoPorConta(currency: string, accountType: string): number {
  if (currency === 'USD' || accountType === 'USD') return VALOR_POR_CONTA_USD
  if (currency === 'EUR') return 120
  return VALOR_POR_CONTA_BRL
}

export async function getGroupMetrics(deliveryGroupId: string) {
  const d = await prisma.deliveryGroup.findUnique({
    where: { id: deliveryGroupId },
    include: {
      client: { include: { metrics: true } },
      order: { select: { value: true, currency: true } },
    },
  })
  if (!d) return null

  const valorPorConta = valorEstimadoPorConta(d.currency, d.accountType)
  const receitaBruta = d.order ? Number(d.order.value) : d.quantityContracted * valorPorConta
  const percentualConclusao = d.quantityContracted > 0
    ? (d.quantityDelivered / d.quantityContracted) * 100
    : 0
  const receitaRealizada = receitaBruta * (percentualConclusao / 100)
  const receitaPendente = receitaBruta - receitaRealizada
  const diasAberto = Math.floor(
    (Date.now() - (d.groupCreatedAt?.getTime() ?? d.createdAt.getTime())) / (24 * 60 * 60 * 1000)
  )
  const isAtrasado =
    d.status === 'ATRASADA' ||
    (d.expectedCompletionAt ? d.expectedCompletionAt < new Date() : false)
  const churnRisk = d.client?.metrics?.churnProbability ? Number(d.client.metrics.churnProbability) : 0
  const isVip = d.client?.metrics?.segmento === 'VIP'

  const priorityScore = calcPriorityScore({
    valorFinanceiro: receitaPendente,
    diasAberto,
    percentualConclusao,
    isVip,
    churnRisk,
    isAtrasado,
  })

  return {
    receitaBruta,
    receitaRealizada,
    receitaPendente,
    margemRealizada: receitaRealizada * 0.25,
    margemProjetada: receitaBruta * 0.25,
    diasAberto,
    percentualConclusao,
    priorityScore,
    riscoOperacional: isAtrasado ? 'ALTO' : percentualConclusao < 30 && diasAberto > 14 ? 'MEDIO' : 'BAIXO',
  }
}
