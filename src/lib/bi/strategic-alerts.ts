/**
 * Sistema de Alertas Estratégicos
 * Dispara alerta quando: churn sobe, LTV cai, LTV/CAC < 3, receita projetada cai, margem cai
 */
import { prisma } from '@/lib/prisma'

const LTV_CAC_RISCO = 3
const LTV_CAC_EXCELENTE = 5

export type AlertType =
  | 'CHURN_MEDIO_ALTO'
  | 'LTV_MEDIO_CAINDO'
  | 'LTV_CAC_BAIXO'
  | 'RECEITA_PROJETADA_CAINDO'
  | 'MARGEM_ABAIXO_PADRAO'

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

async function createAlert(
  type: AlertType,
  severity: AlertSeverity,
  message: string,
  details: Record<string, unknown>
): Promise<void> {
  const exists = await prisma.strategicAlert.findFirst({
    where: { type, resolvedAt: null },
  })
  if (exists) return
  await prisma.strategicAlert.create({
    data: {
      type,
      severity,
      message,
      details: details as object,
    },
  })
}

export async function evaluateStrategicAlerts(): Promise<number> {
  const refDate = new Date()
  refDate.setHours(0, 0, 0, 0)

  const metrics = await prisma.customerMetrics.findMany({
    where: { referenceDate: refDate },
  })

  if (metrics.length === 0) return 0

  let alertsCreated = 0

  const ltvMedio = metrics.reduce((s, m) => s + Number(m.ltvReal), 0) / metrics.length
  const churnRate = metrics.filter((m) => m.churnFlag).length / metrics.length
  const ltvCacRatios = metrics.filter((m) => m.ltvCacRatio != null).map((m) => Number(m.ltvCacRatio!))
  const ltvCacMedio = ltvCacRatios.length > 0 ? ltvCacRatios.reduce((a, b) => a + b, 0) / ltvCacRatios.length : 5
  const receitaProjetada12 = metrics.reduce((s, m) => s + Number(m.ltvProjetado12m ?? 0), 0)
  const margemTotal = metrics.reduce((s, m) => s + Number(m.marginTotal), 0)
  const receitaTotal = metrics.reduce((s, m) => s + Number(m.revenueTotal), 0)
  const margemPercentual = receitaTotal > 0 ? (margemTotal / receitaTotal) * 100 : 0

  // Churn médio alto
  if (churnRate > 0.25) {
    await createAlert(
      'CHURN_MEDIO_ALTO',
      churnRate > 0.4 ? 'CRITICAL' : 'HIGH',
      `Taxa de churn alta: ${(churnRate * 100).toFixed(1)}%`,
      { churnRate, totalClientes: metrics.length }
    )
    alertsCreated++
  }

  // LTV médio baixo (threshold absoluto: R$ 500)
  const LTV_MINIMO_ESPERADO = 500
  if (ltvMedio < LTV_MINIMO_ESPERADO && metrics.length >= 5) {
    await createAlert(
      'LTV_MEDIO_CAINDO',
      'HIGH',
      `LTV médio abaixo do esperado: R$ ${ltvMedio.toFixed(0)} (mínimo esperado: R$ ${LTV_MINIMO_ESPERADO})`,
      { ltvMedio, totalClientes: metrics.length }
    )
    alertsCreated++
  }

  // LTV/CAC abaixo de 3
  if (ltvCacMedio < LTV_CAC_RISCO && ltvCacRatios.length > 0) {
    await createAlert(
      'LTV_CAC_BAIXO',
      ltvCacMedio < 2 ? 'CRITICAL' : 'HIGH',
      `LTV/CAC médio em risco: ${ltvCacMedio.toFixed(1)} (ideal > ${LTV_CAC_RISCO})`,
      { ltvCacMedio, clientesAnalisados: ltvCacRatios.length }
    )
    alertsCreated++
  }

  // Margem abaixo do padrão
  if (margemPercentual < 15 && receitaTotal > 0) {
    await createAlert(
      'MARGEM_ABAIXO_PADRAO',
      margemPercentual < 10 ? 'CRITICAL' : 'HIGH',
      `Margem consolidada abaixo do padrão: ${margemPercentual.toFixed(1)}%`,
      { margemPercentual, receitaTotal }
    )
    alertsCreated++
  }

  return alertsCreated
}
