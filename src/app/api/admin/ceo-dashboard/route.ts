/**
 * Centro de Comando CEO - visão estratégica em tempo real
 * Módulo de Inteligência Estratégica: crescimento, qualidade, base, margem, risco
 */
import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const [
    ordersDelivered,
    ordersMonth,
    ordersLastMonth,
    riskRadar,
    valuation,
    customerMetrics,
    productionG2Month,
    productionPaMonth,
    cohortMonthly,
    strategicAlerts,
  ] = await Promise.all([
    prisma.order.findMany({
      where: { status: 'DELIVERED', paidAt: { not: null } },
      select: { value: true, paidAt: true },
    }),
    prisma.order.findMany({
      where: {
        status: 'DELIVERED',
        paidAt: { not: null, gte: startOfMonth },
      },
      select: { value: true },
    }),
    prisma.order.findMany({
      where: {
        status: 'DELIVERED',
        paidAt: { not: null, gte: startLastMonth, lt: startOfMonth },
      },
      select: { value: true },
    }),
    prisma.riskRadarSnapshot.findFirst({
      where: { referenceDate: { lte: now } },
      orderBy: { referenceDate: 'desc' },
    }),
    prisma.valuationSnapshot.findFirst({
      where: { referenceDate: { lte: now } },
      orderBy: { referenceDate: 'desc' },
    }),
    prisma.customerMetrics.findMany({
      select: {
        ltvLiquido: true,
        ltvReal: true,
        ltvProjetado3m: true,
        ltvProjetado6m: true,
        ltvProjetado12m: true,
        churnRisk: true,
        churnFlag: true,
        segmento: true,
        marginTotal: true,
        revenueTotal: true,
        ltvCacRatio: true,
        cac: true,
      },
    }),
    prisma.productionG2.count({
      where: {
        deletedAt: null,
        status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
        createdAt: { gte: startOfMonth },
      },
    }),
    prisma.productionAccount.count({
      where: {
        status: 'APPROVED',
        validatedAt: { not: null, gte: startOfMonth, lte: endOfMonth },
      },
    }),
    prisma.cohortMonthly.findMany({
      where: { referenceDate: { lte: now } },
      orderBy: { mesAquisicao: 'desc' },
      take: 12,
    }),
    prisma.strategicAlert.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  const productionMonth = productionG2Month + productionPaMonth

  const revenueTotal = ordersDelivered.reduce((s, o) => s + Number(o.value), 0)
  const revenueMonth = ordersMonth.reduce((s, o) => s + Number(o.value), 0)
  const revenueLastMonth = ordersLastMonth.reduce((s, o) => s + Number(o.value), 0)
  const crescimentoMensal =
    revenueLastMonth > 0 ? ((revenueMonth - revenueLastMonth) / revenueLastMonth) * 100 : 0

  const ltvMedio =
    customerMetrics.length > 0
      ? customerMetrics.reduce((s, m) => s + Number(m.ltvReal ?? m.ltvLiquido ?? 0), 0) / customerMetrics.length
      : 0

  const cacMedio =
    customerMetrics.filter((m) => m.cac != null).length > 0
      ? customerMetrics
          .filter((m) => m.cac != null)
          .reduce((s, m) => s + Number(m.cac!), 0) /
        customerMetrics.filter((m) => m.cac != null).length
      : 0

  const ltvCacMedio =
    customerMetrics.filter((m) => m.ltvCacRatio != null).length > 0
      ? customerMetrics
          .filter((m) => m.ltvCacRatio != null)
          .reduce((s, m) => s + Number(m.ltvCacRatio!), 0) /
        customerMetrics.filter((m) => m.ltvCacRatio != null).length
      : null

  const churnRate =
    customerMetrics.length > 0
      ? (customerMetrics.filter((m) => m.churnFlag).length / customerMetrics.length) * 100
      : 0

  const receitaProjetada3m = customerMetrics.reduce((s, m) => s + Number(m.ltvProjetado3m ?? 0), 0)
  const receitaProjetada6m = customerMetrics.reduce((s, m) => s + Number(m.ltvProjetado6m ?? 0), 0)
  const receitaProjetada12m = customerMetrics.reduce((s, m) => s + Number(m.ltvProjetado12m ?? 0), 0)

  const altoRisco = customerMetrics.filter((m) => m.churnRisk === 'ALTO').length
  const receitaEmRisco = customerMetrics
    .filter((m) => m.churnRisk === 'ALTO')
    .reduce((s, m) => s + Number(m.ltvReal ?? m.ltvLiquido ?? 0), 0)
  const perdaPotencial = receitaEmRisco

  const margemTotal = customerMetrics.reduce((s, m) => s + Number(m.marginTotal ?? 0), 0)
  const receitaTotalMetrics = customerMetrics.reduce((s, m) => s + Number(m.revenueTotal ?? 0), 0)
  const margemPercentual = receitaTotalMetrics > 0 ? (margemTotal / receitaTotalMetrics) * 100 : 25

  const margemPorSegmento = customerMetrics.reduce(
    (acc, m) => {
      const seg = m.segmento ?? 'OUTROS'
      if (!acc[seg]) acc[seg] = { receita: 0, margem: 0 }
      acc[seg].receita += Number(m.revenueTotal ?? 0)
      acc[seg].margem += Number(m.marginTotal ?? 0)
      return acc
    },
    {} as Record<string, { receita: number; margem: number }>
  )

  return NextResponse.json({
    crescimento: {
      receitaMensal: revenueMonth,
      crescimentoPercentual: crescimentoMensal,
      projecao3m: receitaProjetada3m,
      projecao6m: receitaProjetada6m,
      projecao12m: receitaProjetada12m,
    },
    qualidade: {
      ltvMedio,
      cacMedio,
      ltvCacRatio: ltvCacMedio,
      churnRate,
    },
    base: {
      valorTotalProjetado: receitaProjetada12m,
      receitaFuturaEstimada: receitaProjetada12m,
      riscoMedioCarteira: churnRate,
    },
    margem: {
      margemRealConsolidada: margemTotal,
      margemPercentual,
      margemPorSegmento,
    },
    risco: {
      clientesAltoRisco: altoRisco,
      receitaExpostaChurn: receitaEmRisco,
      projecaoPerdaPotencial: perdaPotencial,
    },
    receitaAtual: revenueTotal,
    receitaMes: revenueMonth,
    receitaProjetada: revenueMonth * 1.02,
    ltvMedio,
    churnAltoRisco: altoRisco,
    margemReal: margemPercentual,
    valorBase: revenueTotal,
    receitaEmRisco,
    valuation: valuation
      ? {
          conservador: Number(valuation.valuationConservador),
          moderado: Number(valuation.valuationModerado),
          agressivo: Number(valuation.valuationAgressivo),
        }
      : null,
    indiceSaude: riskRadar?.scoreGeral ?? 0,
    classificacaoRisco: riskRadar?.classificacao ?? 'N/A',
    producaoMes: productionMonth,
    cohortes: cohortMonthly.map((c) => ({
      mesAquisicao: c.mesAquisicao,
      clientesAtivos: c.clientesAtivos,
      receitaMes1: Number(c.receitaMes1),
      receitaMes2: Number(c.receitaMes2),
      receitaMes3: Number(c.receitaMes3),
      retencaoPercentual: c.retencaoPercentual != null ? Number(c.retencaoPercentual) : null,
      margemPercentual: c.margemPercentual != null ? Number(c.margemPercentual) : null,
    })),
    alertas: strategicAlerts.map((a) => ({
      type: a.type,
      severity: a.severity,
      message: a.message,
      details: a.details,
      createdAt: a.createdAt,
    })),
  })
}
