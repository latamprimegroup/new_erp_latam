/**
 * Profit Engine - Centro de Engenharia de Lucro
 * P&L diário, margens, lucro projetado e gap para meta
 */
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'

const META_LUCRO_DEFAULT = 100_000_000

async function getMetaLucro12m(): Promise<number> {
  const s = await prisma.systemSetting.findUnique({ where: { key: 'meta_lucro_12m' } })
  return s ? parseFloat(s.value) : META_LUCRO_DEFAULT
}

export async function computeProfitEngineSnapshot(): Promise<void> {
  const refDate = new Date()
  refDate.setHours(0, 0, 0, 0)
  const startOfYear = new Date(refDate.getFullYear(), 0, 1)
  const oneYearAgo = new Date(refDate)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const [orders12m, ordersYTD, expenses, metaSetting] = await Promise.all([
    prisma.order.findMany({
      where: { status: 'DELIVERED', paidAt: { not: null, gte: oneYearAgo } },
      select: { value: true, id: true },
    }),
    prisma.order.findMany({
      where: { status: 'DELIVERED', paidAt: { not: null, gte: startOfYear } },
      select: { value: true, id: true },
    }),
    prisma.financialEntry.findMany({
      where: { type: 'EXPENSE', date: { gte: oneYearAgo } },
      select: { value: true, orderId: true },
    }),
    getMetaLucro12m(),
  ])

  const receitaBruta12m = orders12m.reduce((s, o) => s + Number(o.value), 0)
  const receitaBrutaYTD = ordersYTD.reduce((s, o) => s + Number(o.value), 0)
  const orderIds = new Set(orders12m.map((o) => o.id))

  let custoVariavel = 0
  let custoFixo = 0
  for (const e of expenses) {
    const v = Number(e.value)
    if (e.orderId && orderIds.has(e.orderId)) {
      custoVariavel += v
    } else {
      custoFixo += v
    }
  }

  const custoTotal = custoVariavel + custoFixo
  const lucroBruto = receitaBruta12m - custoVariavel
  const margemBrutaPct = receitaBruta12m > 0 ? (lucroBruto / receitaBruta12m) * 100 : 0
  const lucroOperacional = lucroBruto - custoFixo
  const margemLiquidaPct = receitaBruta12m > 0 ? (lucroOperacional / receitaBruta12m) * 100 : 0
  const receitaLiquida = receitaBruta12m
  const margemBruta = lucroBruto
  const margemLiquida = lucroOperacional
  const lucroLiquido = lucroOperacional

  const mesesDecorridos = Math.max(1, refDate.getMonth() + 1)
  const lucroAcumuladoAno = (lucroLiquido / 12) * mesesDecorridos
  const lucroProjetado12m = lucroLiquido
  const gapParaMeta = metaSetting - lucroProjetado12m

  await prisma.profitEngineSnapshot.upsert({
    where: { referenceDate: refDate },
    create: {
      referenceDate: refDate,
      receitaBruta: new Decimal(receitaBruta12m),
      receitaLiquida: new Decimal(receitaLiquida),
      custoVariavel: new Decimal(custoVariavel),
      custoFixo: new Decimal(custoFixo),
      margemBruta: new Decimal(margemBruta),
      margemBrutaPct: new Decimal(margemBrutaPct),
      margemLiquida: new Decimal(margemLiquida),
      margemLiquidaPct: new Decimal(margemLiquidaPct),
      lucroOperacional: new Decimal(lucroOperacional),
      lucroLiquido: new Decimal(lucroLiquido),
      lucroAcumuladoAno: new Decimal(lucroAcumuladoAno),
      lucroProjetado12m: new Decimal(lucroProjetado12m),
      metaLucro12m: new Decimal(metaSetting),
      gapParaMeta: new Decimal(gapParaMeta),
    },
    update: {
      receitaBruta: new Decimal(receitaBruta12m),
      receitaLiquida: new Decimal(receitaLiquida),
      custoVariavel: new Decimal(custoVariavel),
      custoFixo: new Decimal(custoFixo),
      margemBruta: new Decimal(margemBruta),
      margemBrutaPct: new Decimal(margemBrutaPct),
      margemLiquida: new Decimal(margemLiquida),
      margemLiquidaPct: new Decimal(margemLiquidaPct),
      lucroOperacional: new Decimal(lucroOperacional),
      lucroLiquido: new Decimal(lucroLiquido),
      lucroAcumuladoAno: new Decimal(lucroAcumuladoAno),
      lucroProjetado12m: new Decimal(lucroProjetado12m),
      metaLucro12m: new Decimal(metaSetting),
      gapParaMeta: new Decimal(gapParaMeta),
    },
  })
}
