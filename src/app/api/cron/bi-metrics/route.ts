/**
 * Cron diário - recalcula métricas BI e Inteligência Estratégica
 * GET /api/cron/bi-metrics?secret=CRON_SECRET
 */
import { NextRequest, NextResponse } from 'next/server'
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
import { computeProfitEngineSnapshot } from '@/lib/profit-engine'
import { computeUnitEconomics } from '@/lib/profit-engine/unit-economics'
import { persistRadarAlerts } from '@/lib/profit-engine/profit-destruction-radar'

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const metricsCount = await computeFullCustomerMetrics()
    await computeRiskRadar()
    await computeValuation()
    await computeProductionMetrics()
    await computeCohortMetrics()
    const cohortMonthlyCount = await computeCohortMonthly()
    const sellerScoreCount = await computeSellerCommercialScores()
    const alertsCreated = await evaluateStrategicAlerts()
    const operatorScoreCount = await computeOperatorScores()
    await computeBottleneckReport()
    const opAlerts = await evaluateOperationalAlerts()
    await computeProfitEngineSnapshot()
    const unitEconCount = await computeUnitEconomics()
    const radarAlerts = await persistRadarAlerts()

    return NextResponse.json({
      ok: true,
      customerMetricsUpdated: metricsCount,
      cohortMonthlyUpdated: cohortMonthlyCount,
      sellerScoresUpdated: sellerScoreCount,
      alertsCreated,
      operatorScoresUpdated: operatorScoreCount,
      operationalAlertsCreated: opAlerts,
      profitEngineUpdated: true,
      unitEconomicsUpdated: unitEconCount,
      radarAlertsCreated: radarAlerts,
    })
  } catch (e) {
    console.error('BI metrics cron error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 }
    )
  }
}
