/**
 * Score Operacional por Colaborador - Produção
 */
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'

export async function computeOperatorScores(): Promise<number> {
  const refDate = new Date()
  refDate.setHours(0, 0, 0, 0)
  const startOfMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 1)
  const startOfDay = new Date(refDate)
  startOfDay.setHours(0, 0, 0, 0)

  const metaSetting = await prisma.systemSetting.findUnique({
    where: { key: 'producao_meta_mensal' },
  })
  const metaMensal = metaSetting ? parseInt(metaSetting.value, 10) : 330

  const g2Items = await prisma.productionG2.findMany({
    where: { deletedAt: null },
    select: { creatorId: true, status: true, createdAt: true, validatedAt: true, rejectedAt: true, sentToStockAt: true },
  })

  const monthItems = g2Items.filter(
    (g) =>
      (g.validatedAt && g.validatedAt >= startOfMonth) ||
      (g.rejectedAt && g.rejectedAt >= startOfMonth)
  )
  const dayItems = g2Items.filter((g) => g.sentToStockAt && g.sentToStockAt >= startOfDay)

  const byCreator = new Map<string, { aprovadas: number; reprovadas: number; tempos: number[]; dia: number }>()
  for (const g of monthItems) {
    const cur = byCreator.get(g.creatorId) ?? { aprovadas: 0, reprovadas: 0, tempos: [], dia: 0 }
    if (g.status === 'APROVADA' || g.status === 'ENVIADA_ESTOQUE') cur.aprovadas++
    else if (g.status === 'REPROVADA') cur.reprovadas++
    if (g.validatedAt && g.createdAt) {
      const min = (g.validatedAt.getTime() - g.createdAt.getTime()) / (60 * 1000)
      if (min > 0) cur.tempos.push(min)
    }
    byCreator.set(g.creatorId, cur)
  }
  for (const g of dayItems) {
    const cur = byCreator.get(g.creatorId)
    if (cur) cur.dia++
    else byCreator.set(g.creatorId, { aprovadas: 0, reprovadas: 0, tempos: [], dia: 1 })
  }

  const total = monthItems.length
  const taxaAprovacaoGeral = total > 0 ? (monthItems.filter((g) => g.status === 'APROVADA' || g.status === 'ENVIADA_ESTOQUE').length / total) * 100 : 0
  const taxaReprovacaoGeral = total > 0 ? (monthItems.filter((g) => g.status === 'REPROVADA').length / total) * 100 : 0
  const tempos = monthItems
    .filter((g) => g.validatedAt && g.createdAt)
    .map((g) => (g.validatedAt!.getTime() - g.createdAt!.getTime()) / (60 * 1000))
    .filter((t) => t > 0)
  const tempoMedioGeral = tempos.length > 0 ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null

  const sorted = [...byCreator.entries()].sort((a, b) => b[1].aprovadas - a[1].aprovadas)
  let count = 0
  for (let i = 0; i < sorted.length; i++) {
    const [userId, data] = sorted[i]
    const totalUser = data.aprovadas + data.reprovadas
    const taxaAprovacao = totalUser > 0 ? (data.aprovadas / totalUser) * 100 : taxaAprovacaoGeral
    const taxaReprovacao = totalUser > 0 ? (data.reprovadas / totalUser) * 100 : taxaReprovacaoGeral
    const tempoMedio = data.tempos.length > 0 ? Math.round(data.tempos.reduce((a, b) => a + b, 0) / data.tempos.length) : tempoMedioGeral
    const scoreQualidade = Math.min(100, Math.round(taxaAprovacao))
    const scoreProdutividade = metaMensal > 0 ? Math.min(100, Math.round((data.aprovadas / metaMensal) * 100)) : 0
    const scoreGeral = Math.round(scoreProdutividade * 0.5 + scoreQualidade * 0.5)

    await prisma.operatorScore.upsert({
      where: { userId_referenceDate_setor: { userId, referenceDate: refDate, setor: 'PRODUCAO' } },
      create: {
        userId,
        referenceDate: refDate,
        setor: 'PRODUCAO',
        producaoDiaria: data.dia,
        producaoMensal: data.aprovadas,
        metaMensal,
        taxaAprovacao: new Decimal(taxaAprovacao),
        taxaReprovacao: new Decimal(taxaReprovacao),
        tempoMedioTarefa: tempoMedio ?? null,
        scoreProdutividade,
        scoreQualidade,
        scoreGeral,
        rankingMes: i + 1,
      },
      update: {
        producaoDiaria: data.dia,
        producaoMensal: data.aprovadas,
        metaMensal,
        taxaAprovacao: new Decimal(taxaAprovacao),
        taxaReprovacao: new Decimal(taxaReprovacao),
        tempoMedioTarefa: tempoMedio ?? null,
        scoreProdutividade,
        scoreQualidade,
        scoreGeral,
        rankingMes: i + 1,
      },
    })
    count++
  }
  return count
}
