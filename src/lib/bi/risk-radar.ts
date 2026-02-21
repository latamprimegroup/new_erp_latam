/**
 * Risk Radar - Score de saúde empresarial (0-100)
 * Agrega churn, margem, CAC, produção, estoque
 */
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'

export async function computeRiskRadar(): Promise<void> {
  const refDate = new Date()
  refDate.setHours(0, 0, 0, 0)

  const metrics = await prisma.customerMetrics.findMany({
    where: { referenceDate: refDate },
  })

  if (metrics.length === 0) {
    await prisma.riskRadarSnapshot.upsert({
      where: { referenceDate: refDate },
      create: {
        referenceDate: refDate,
        scoreGeral: 50,
        classificacao: 'ATENCAO',
        detalhes: { message: 'Sem métricas de clientes' },
      },
      update: {
        scoreGeral: 50,
        classificacao: 'ATENCAO',
        detalhes: { message: 'Sem métricas de clientes' },
      },
    })
    return
  }

  const churnRate = metrics.filter((m) => m.churnFlag).length / metrics.length
  const churnScore = Math.max(0, 100 - churnRate * 100)

  const receitaTotal = metrics.reduce((s, m) => s + Number(m.revenueTotal), 0)
  const margemTotal = metrics.reduce((s, m) => s + Number(m.marginTotal), 0)
  const margemPct = receitaTotal > 0 ? (margemTotal / receitaTotal) * 100 : 0
  const margemScore = Math.min(100, Math.max(0, margemPct * 2))

  const ltvCacRatios = metrics.filter((m) => m.ltvCacRatio != null).map((m) => Number(m.ltvCacRatio!))
  const ltvCacMedio = ltvCacRatios.length > 0 ? ltvCacRatios.reduce((a, b) => a + b, 0) / ltvCacRatios.length : 3
  const cacScore = Math.min(100, Math.round(ltvCacMedio * 20))

  const prodCount = await prisma.productionG2.count({
    where: {
      deletedAt: null,
      status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
      validatedAt: { gte: new Date(refDate.getFullYear(), refDate.getMonth(), 1) },
    },
  })
  const producaoScore = Math.min(100, prodCount)

  const estoqueCount = await prisma.stockAccount.count({ where: { status: 'AVAILABLE' } })
  const estoqueScore = Math.min(100, estoqueCount * 5)

  const scoreGeral = Math.round(
    (churnScore * 0.3 + margemScore * 0.25 + cacScore * 0.2 + producaoScore * 0.15 + estoqueScore * 0.1)
  )
  const clamped = Math.min(100, Math.max(0, scoreGeral))

  let classificacao: 'SAUDAVEL' | 'ATENCAO' | 'RISCO' | 'CRITICO' = 'SAUDAVEL'
  if (clamped < 30) classificacao = 'CRITICO'
  else if (clamped < 50) classificacao = 'RISCO'
  else if (clamped < 70) classificacao = 'ATENCAO'

  await prisma.riskRadarSnapshot.upsert({
    where: { referenceDate: refDate },
    create: {
      referenceDate: refDate,
      scoreGeral: clamped,
      classificacao,
      churnScore: new Decimal(churnScore.toFixed(2)),
      margemScore: new Decimal(margemScore.toFixed(2)),
      cacScore: new Decimal(cacScore.toFixed(2)),
      producaoScore: new Decimal(producaoScore.toFixed(2)),
      estoqueScore: new Decimal(estoqueScore.toFixed(2)),
      detalhes: {
        churnRate,
        margemPct,
        ltvCacMedio,
        prodCount,
        estoqueCount,
      },
    },
    update: {
      scoreGeral: clamped,
      classificacao,
      churnScore: new Decimal(churnScore.toFixed(2)),
      margemScore: new Decimal(margemScore.toFixed(2)),
      cacScore: new Decimal(cacScore.toFixed(2)),
      producaoScore: new Decimal(producaoScore.toFixed(2)),
      estoqueScore: new Decimal(estoqueScore.toFixed(2)),
      detalhes: {
        churnRate,
        margemPct,
        ltvCacMedio,
        prodCount,
        estoqueCount,
      },
    },
  })
}
