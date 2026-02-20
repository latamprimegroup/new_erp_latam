/**
 * Alertas Operacionais Automáticos
 * Estoque baixo, produção abaixo ritmo, reprovação alta, entregas atrasadas, margem reduzida, reposições acima da média
 */
import { prisma } from '@/lib/prisma'

const SEVERITY = { LOW: 'LOW', MEDIUM: 'MEDIUM', CRITICAL: 'CRITICAL' } as const

async function createOperationalAlert(
  type: string,
  severity: string,
  message: string,
  details: Record<string, unknown>
): Promise<void> {
  const exists = await prisma.strategicAlert.findFirst({
    where: { type, resolvedAt: null },
  })
  if (exists) return
  await prisma.strategicAlert.create({
    data: { type, severity, message, details: details as object },
  })
}

export async function evaluateOperationalAlerts(): Promise<number> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  let count = 0

  const [
    stockAvailable,
    stockMinSetting,
    producaoMes,
    metaSetting,
    atrasadas,
    reposicoes,
    repositionsTotal,
    financialMonth,
  ] = await Promise.all([
    prisma.stockAccount.count({ where: { deletedAt: null, status: 'AVAILABLE' } }),
    prisma.systemSetting.findUnique({ where: { key: 'estoque_minimo' } }),
    prisma.productionG2.count({
      where: {
        deletedAt: null,
        status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
        validatedAt: { not: null, gte: startOfMonth },
      },
    }),
    prisma.systemSetting.findUnique({ where: { key: 'producao_meta_mensal' } }),
    prisma.deliveryGroup.count({ where: { status: 'ATRASADA' } }),
    prisma.deliveryReposition.count({
      where: { status: { in: ['SOLICITADA', 'APROVADA'] } },
    }),
    prisma.deliveryReposition.count({
      where: { requestedAt: { gte: startOfMonth } },
    }),
    prisma.financialEntry.findMany({
      where: { date: { gte: startOfMonth } },
      select: { type: true, value: true },
    }),
  ])

  const meta = metaSetting ? parseInt(metaSetting.value, 10) : 330
  const diasNoMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const diasDecorridos = now.getDate()
  const producaoEsperada = Math.floor((meta / diasNoMes) * diasDecorridos)
  const ritmoOk = producaoMes >= producaoEsperada * 0.8

  const minStock = stockMinSetting ? parseInt(stockMinSetting.value, 10) : 50
  if (stockAvailable < minStock) {
    await createOperationalAlert(
      'ESTOQUE_BAIXO',
      stockAvailable < minStock / 2 ? SEVERITY.CRITICAL : SEVERITY.MEDIUM,
      `Estoque disponível (${stockAvailable}) abaixo do mínimo (${minStock})`,
      { stockAvailable, minStock }
    )
    count++
  }

  if (!ritmoOk && diasDecorridos >= 5) {
    await createOperationalAlert(
      'PRODUCAO_ABAIXO_RITMO',
      producaoMes < producaoEsperada * 0.5 ? SEVERITY.CRITICAL : SEVERITY.MEDIUM,
      `Produção do mês (${producaoMes}) abaixo do ritmo ideal (esperado: ~${producaoEsperada})`,
      { producaoMes, producaoEsperada, meta }
    )
    count++
  }

  if (atrasadas > 0) {
    await createOperationalAlert(
      'ENTREGAS_ATRASADAS',
      atrasadas >= 5 ? SEVERITY.CRITICAL : SEVERITY.MEDIUM,
      `${atrasadas} entrega(s) atrasada(s)`,
      { atrasadas }
    )
    count++
  }

  const receita = financialMonth.filter((f) => f.type === 'INCOME').reduce((s, f) => s + Number(f.value), 0)
  const despesa = financialMonth.filter((f) => f.type === 'EXPENSE').reduce((s, f) => s + Number(f.value), 0)
  const margemPct = receita > 0 ? ((receita - despesa) / receita) * 100 : 0
  if (receita > 0 && margemPct < 15) {
    await createOperationalAlert(
      'MARGEM_REDUZIDA',
      margemPct < 10 ? SEVERITY.CRITICAL : SEVERITY.MEDIUM,
      `Margem operacional em ${margemPct.toFixed(1)}% (abaixo de 15%)`,
      { margemPct, receita, despesa }
    )
    count++
  }

  const groups = await prisma.deliveryGroup.findMany({
    where: { status: { in: ['AGUARDANDO_INICIO', 'EM_ANDAMENTO', 'PARCIALMENTE_ENTREGUE'] } },
    select: { id: true, groupNumber: true, quantityContracted: true, quantityDelivered: true, createdAt: true },
  })
  const abaixo30Apos14 = groups.filter((g) => {
    if (g.quantityContracted === 0) return false
    const pct = (g.quantityDelivered / g.quantityContracted) * 100
    const dias = Math.floor((Date.now() - g.createdAt.getTime()) / (24 * 60 * 60 * 1000))
    return pct < 30 && dias > 14
  })
  if (abaixo30Apos14.length > 0) {
    await createOperationalAlert(
      'ENTREGAS_ABAIXO_30_PCT',
      abaixo30Apos14.length >= 5 ? SEVERITY.CRITICAL : SEVERITY.MEDIUM,
      `${abaixo30Apos14.length} entrega(s) com menos de 30% de conclusão após 14+ dias`,
      { count: abaixo30Apos14.length, groupNumbers: abaixo30Apos14.map((g) => g.groupNumber) }
    )
    count++
  }

  const totalGroups = await prisma.deliveryGroup.count({ where: { status: { not: 'CANCELADA' } } })
  const reposicaoMedia = totalGroups > 0 ? repositionsTotal / totalGroups : 0
  if (repositionsTotal > 0 && reposicaoMedia > 0.5) {
    await createOperationalAlert(
      'REPOSICAO_ACIMA_MEDIA',
      SEVERITY.MEDIUM,
      `Reposições do mês (${repositionsTotal}) acima da média esperada`,
      { repositionsTotal, totalGroups }
    )
    count++
  }

  return count
}
