/**
 * POST - Disparar cálculo manual das métricas BI e Performance (admin)
 */
import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { computeFullCustomerMetrics } from '@/lib/bi/intelligence-engine'
import { computeRiskRadar } from '@/lib/bi/risk-radar'
import { computeValuation } from '@/lib/bi/valuation'
import { computeProductionMetrics } from '@/lib/bi/production-metrics'
import { computeCohortMetrics } from '@/lib/bi/cohort'
import { computeCohortMonthly } from '@/lib/bi/cohort-monthly'
import { computeSellerCommercialScores } from '@/lib/bi/seller-score'
import { evaluateStrategicAlerts } from '@/lib/bi/strategic-alerts'
import { computeOperatorScores } from '@/lib/performance/operator-score'
import { computeBottleneckReport } from '@/lib/performance/bottleneck'
import { evaluateOperationalAlerts } from '@/lib/performance/operational-alerts'

export async function POST() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  try {
    const metricsCount = await computeFullCustomerMetrics()
    await computeRiskRadar()
    await computeValuation()
    await computeProductionMetrics()
    await computeCohortMetrics()
    await computeCohortMonthly()
    await computeSellerCommercialScores()
    await evaluateStrategicAlerts()
    const operatorCount = await computeOperatorScores()
    await computeBottleneckReport()
    const opAlerts = await evaluateOperationalAlerts()

    return NextResponse.json({
      ok: true,
      customerMetricsUpdated: metricsCount,
      operatorScoresUpdated: operatorCount,
      operationalAlertsCreated: opAlerts,
    })
  } catch (e) {
    console.error('BI sync error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 }
    )
  }
}
