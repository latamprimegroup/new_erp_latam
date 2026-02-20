/**
 * Radar de Destruição de Lucro
 */
import { prisma } from '@/lib/prisma'

export type ProfitDestroyer = {
  type: string
  severity: string
  message: string
  details: Record<string, unknown>
}

export async function detectProfitDestroyers(): Promise<ProfitDestroyer[]> {
  const refDate = new Date()
  refDate.setHours(0, 0, 0, 0)
  const result: ProfitDestroyer[] = []
  const startOfMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 1)

  const maxRef = await prisma.customerMetrics.aggregate({ _max: { referenceDate: true } })
  const metricsRefDate = maxRef._max.referenceDate ?? refDate

  const maxUnitRef = await prisma.unitEconomicsSnapshot.aggregate({ _max: { referenceDate: true } })
  const unitRefDate = maxUnitRef._max.referenceDate ?? refDate

  const [metrics, unitEcon, repositions] = await Promise.all([
    prisma.customerMetrics.findMany({
      where: { referenceDate: metricsRefDate },
      select: { marginTotal: true, ltvCacRatio: true },
    }),
    prisma.unitEconomicsSnapshot.findMany({
      where: { referenceDate: unitRefDate, margemNegativa: true },
      select: { tipoConta: true, moeda: true },
    }),
    prisma.deliveryReposition.groupBy({
      by: ['deliveryId'],
      where: { status: { in: ['APROVADA', 'CONCLUIDA'] }, requestedAt: { gte: startOfMonth } },
      _count: { id: true },
    }),
  ])

  const margemNeg = metrics.filter((m) => Number(m.marginTotal) < 0).length
  if (margemNeg > 0) {
    result.push({ type: 'CLIENTE_MARGEM_NEGATIVA', severity: 'CRITICAL', message: `${margemNeg} cliente(s) com margem negativa`, details: {} })
  }

  const cacMaior = metrics.filter((m) => m.ltvCacRatio && Number(m.ltvCacRatio) < 1).length
  if (cacMaior > 0) {
    result.push({ type: 'CAC_MAIOR_LTV', severity: 'CRITICAL', message: `${cacMaior} cliente(s) com CAC > LTV`, details: {} })
  }

  if (unitEcon.length > 0) {
    result.push({
      type: 'PRODUTO_MARGEM_NEGATIVA',
      severity: 'CRITICAL',
      message: `${unitEcon.length} tipo(s) de conta com margem negativa`,
      details: { tipos: unitEcon.map((u) => u.tipoConta) },
    })
  }

  const totalRepos = repositions.reduce((s, r) => s + r._count.id, 0)
  if (repositions.length >= 5 && totalRepos > 10) {
    result.push({
      type: 'ALTO_INDICE_REPOSICAO',
      severity: 'MEDIUM',
      message: `${totalRepos} reposições este mês`,
      details: { totalRepos },
    })
  }

  return result
}

/** Persiste alertas do radar em StrategicAlert */
export async function persistRadarAlerts(): Promise<number> {
  const destroyers = await detectProfitDestroyers()
  const critical = destroyers.filter((d) => d.severity === 'CRITICAL' || d.severity === 'HIGH')
  let created = 0
  for (const d of critical) {
    const exists = await prisma.strategicAlert.findFirst({
      where: { type: `PROFIT_${d.type}`, resolvedAt: null },
    })
    if (!exists) {
      await prisma.strategicAlert.create({
        data: {
          type: `PROFIT_${d.type}`,
          severity: d.severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
          message: d.message,
          details: d.details as object,
        },
      })
      created++
    }
  }
  return created
}
