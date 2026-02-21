/**
 * Análise de Gargalos - Relatório mensal
 */
import { prisma } from '@/lib/prisma'

export async function computeBottleneckReport(): Promise<void> {
  const refDate = new Date()
  refDate.setHours(0, 0, 0, 0)
  const startOfMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 1)

  const [g2Reprovadas, repositions, deliveries] = await Promise.all([
    prisma.productionG2.groupBy({
      by: ['rejectedReason'],
      where: { deletedAt: null, status: 'REPROVADA', rejectedAt: { gte: startOfMonth } },
      _count: { id: true },
    }),
    prisma.deliveryReposition.groupBy({
      by: ['deliveryId'],
      where: { status: { in: ['APROVADA', 'CONCLUIDA'] }, requestedAt: { gte: startOfMonth } },
      _count: { id: true },
    }),
    prisma.deliveryGroup.findMany({
      where: { createdAt: { gte: startOfMonth } },
      select: { id: true, clientId: true },
    }),
  ])

  const deliveryToClient = new Map<string, string>()
  for (const d of deliveries) deliveryToClient.set(d.id, d.clientId)
  const repoByClient = new Map<string, number>()
  for (const r of repositions) {
    const c = deliveryToClient.get(r.deliveryId)
    if (c) repoByClient.set(c, (repoByClient.get(c) ?? 0) + r._count.id)
  }
  const clienteMaiorReposicao = repoByClient.size > 0
    ? Array.from(repoByClient.entries()).sort((a, b) => b[1] - a[1])[0][0]
    : null

  const tipoContaReprovacao = g2Reprovadas.length > 0
    ? g2Reprovadas.sort((a, b) => b._count.id - a._count.id)[0].rejectedReason ?? 'N/A'
    : null

  const prodRetrabalho = await prisma.productionG2.groupBy({
    by: ['creatorId'],
    where: { deletedAt: null, status: 'REPROVADA', rejectedAt: { gte: startOfMonth } },
    _count: { id: true },
  })
  const colaboradorRetrabalho = prodRetrabalho.length > 0
    ? prodRetrabalho.sort((a, b) => b._count.id - a._count.id)[0].creatorId
    : null

  const details = { reprovacoesPorMotivo: g2Reprovadas.map((r) => ({ motivo: r.rejectedReason ?? 'N/A', count: r._count.id })) }

  await prisma.bottleneckReport.upsert({
    where: { referenceDate: refDate },
    create: {
      referenceDate: refDate,
      etapaMaisDemora: 'PRODUCAO',
      setorMaiorErro: g2Reprovadas.length > 0 ? 'PRODUCAO' : null,
      colaboradorRetrabalho,
      tipoContaReprovacao,
      clienteMaiorReposicao,
      details: details as object,
    },
    update: {
      etapaMaisDemora: 'PRODUCAO',
      setorMaiorErro: g2Reprovadas.length > 0 ? 'PRODUCAO' : null,
      colaboradorRetrabalho,
      tipoContaReprovacao,
      clienteMaiorReposicao,
      details: details as object,
    },
  })
}
