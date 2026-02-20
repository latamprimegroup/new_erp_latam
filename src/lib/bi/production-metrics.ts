/**
 * Métricas de produção - taxa aprovação, tempo médio, ranking
 */
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { getProducerRanking } from '@/lib/g2-agent'

export async function computeProductionMetrics(): Promise<void> {
  const refDate = new Date()
  refDate.setHours(0, 0, 0, 0)
  const startOfMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 1)
  const startOfWeek = new Date(refDate)
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const metaSetting = await prisma.systemSetting.findUnique({
    where: { key: 'producao_meta_mensal' },
  })
  const metaMensal = metaSetting ? parseInt(metaSetting.value, 10) : 330

  const [g2Month, approved, rejected, todayCount] = await Promise.all([
    prisma.productionG2.findMany({
      where: {
        deletedAt: null,
        status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
        validatedAt: { not: null, gte: startOfMonth },
      },
      select: { creatorId: true, createdAt: true, validatedAt: true },
    }),
    prisma.productionG2.count({
      where: {
        deletedAt: null,
        status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
        validatedAt: { not: null, gte: startOfMonth },
      },
    }),
    prisma.productionG2.count({
      where: {
        deletedAt: null,
        status: 'REPROVADA',
        rejectedAt: { gte: startOfMonth },
      },
    }),
    prisma.productionG2.count({
      where: {
        deletedAt: null,
        status: 'ENVIADA_ESTOQUE',
        sentToStockAt: { gte: refDate },
      },
    }),
  ])

  const total = approved + rejected
  const taxaAprovacao = total > 0 ? (approved / total) * 100 : 0
  const taxaReprovacao = total > 0 ? (rejected / total) * 100 : 0

  let tempoMedioMin = 0
  if (g2Month.length > 0) {
    const tempos = g2Month
      .map((g) => {
        const created = g.createdAt.getTime()
        const validated = g.validatedAt ? g.validatedAt.getTime() : created
        return (validated - created) / (60 * 1000)
      })
      .filter((t) => t > 0)
    tempoMedioMin = tempos.length > 0 ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0
  }

  const ranking = await getProducerRanking()
  const byCreator = new Map<string, number>()
  for (const g of g2Month) {
    byCreator.set(g.creatorId, (byCreator.get(g.creatorId) ?? 0) + 1)
  }
  const semanaCount = g2Month.filter((g) => g.validatedAt && g.validatedAt >= startOfWeek).length

  await prisma.productionMetricsSnapshot.deleteMany({
    where: {
      referenceDate: refDate,
    },
  })

  const scoreQualidade = Math.min(100, Math.round(taxaAprovacao))
  await prisma.productionMetricsSnapshot.create({
    data: {
      referenceDate: refDate,
      producerId: null,
      producaoDia: todayCount,
      producaoSemana: semanaCount,
      producaoMes: approved,
      metaMensal,
      taxaAprovacao: new Decimal(taxaAprovacao),
      taxaReprovacao: new Decimal(taxaReprovacao),
      tempoMedioConta: tempoMedioMin || null,
      scoreQualidade,
      scoreProdutividade: metaMensal > 0 ? Math.min(100, Math.round((approved / metaMensal) * 100)) : 0,
    },
  })

  for (const r of ranking) {
    const producaoMes = byCreator.get(r.producerId) ?? 0
    const scoreProdutividade = metaMensal > 0 ? Math.min(100, Math.round((producaoMes / metaMensal) * 100)) : 0
    await prisma.productionMetricsSnapshot.create({
      data: {
        referenceDate: refDate,
        producerId: r.producerId,
        producaoDia: 0,
        producaoSemana: 0,
        producaoMes,
        metaMensal,
        taxaAprovacao: new Decimal(taxaAprovacao),
        taxaReprovacao: new Decimal(taxaReprovacao),
        tempoMedioConta: tempoMedioMin || null,
        scoreQualidade,
        scoreProdutividade,
        rankingMes: r.rank,
      },
    })
  }
}
