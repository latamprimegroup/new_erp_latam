/**
 * Dashboard de LTV – Visão Estratégica
 * LTV médio geral, por tipo conta, moeda, país, vendedor, faixa de cliente
 * Dados para gráficos: curva retenção, evolução LTV, LTV vs CAC, ranking
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

/** Faixa de cliente por LTV (pequeno, médio, grande) */
function faixaCliente(ltv: number, p33: number, p66: number): 'PEQUENO' | 'MEDIO' | 'GRANDE' {
  if (ltv < p33) return 'PEQUENO'
  if (ltv < p66) return 'MEDIO'
  return 'GRANDE'
}

export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const dataInicioStr = searchParams.get('dataInicio')
  const dataFimStr = searchParams.get('dataFim')
  const dataInicio = dataInicioStr ? new Date(dataInicioStr) : null
  const dataFim = dataFimStr ? new Date(dataFimStr) : null

  const refDate = new Date()
  refDate.setHours(0, 0, 0, 0)

  const where: { referenceDate: Date; dataPrimeiraCompra?: { gte?: Date; lte?: Date } } = {
    referenceDate: refDate,
  }
  if (dataInicio ?? dataFim) {
    const dp: { gte?: Date; lte?: Date } = {}
    if (dataInicio) dp.gte = dataInicio
    if (dataFim) dp.lte = dataFim
    if (Object.keys(dp).length > 0) where.dataPrimeiraCompra = dp
  }

  const metrics = await prisma.customerMetrics.findMany({
    where,
    include: {
      client: {
        select: {
          id: true,
          user: { select: { name: true, email: true } },
          country: true,
        },
      },
    },
  })

  if (metrics.length === 0) {
    return NextResponse.json({
      ltvMedioGeral: 0,
      porTipoConta: {},
      porMoeda: {},
      porPais: {},
      porVendedor: {},
      porFaixa: { PEQUENO: 0, MEDIO: 0, GRANDE: 0 },
      porCanal: { N_A: metrics.length },
      ltvVsCac: [],
      rankingClientes: [],
      curvaRetencao: [],
      evolucaoLtvMensal: [],
      metricasComplementares: {
        cacMedio: 0,
        ltvCacRatioMedio: null,
        paybackMedio: null,
        churnRate: 0,
        retencaoMensal: 0,
        receitaRecorrenteMedia: 0,
        margemLiquidaMedia: 0,
      },
    })
  }

  const ltvValues = metrics.map((m) => Number(m.ltvReal ?? m.revenueTotal)).filter((v) => v > 0).sort((a, b) => a - b)
  const p33 = ltvValues[Math.floor(ltvValues.length * 0.33)] ?? 0
  const p66 = ltvValues[Math.floor(ltvValues.length * 0.66)] ?? ltvValues[ltvValues.length - 1] ?? 0

  const ltvMedioGeral = metrics.reduce((s, m) => s + Number(m.ltvReal ?? m.revenueTotal), 0) / metrics.length

  const porTipoConta: Record<string, { count: number; sum: number }> = {}
  const porMoeda: Record<string, { count: number; sum: number }> = {}
  const porPais: Record<string, { count: number; sum: number }> = {}
  const porVendedor: Record<string, { count: number; sum: number }> = {}
  const porFaixa = { PEQUENO: 0, MEDIO: 0, GRANDE: 0 }

  for (const m of metrics) {
    const ltv = Number(m.ltvReal ?? m.revenueTotal)
    const tipo = m.tipoConta ?? 'N/A'
    const moeda = m.moeda ?? 'BRL'
    const pais = m.pais ?? 'N/A'
    const vendedor = m.vendedorId ?? 'N/A'

    if (!porTipoConta[tipo]) porTipoConta[tipo] = { count: 0, sum: 0 }
    porTipoConta[tipo].count++
    porTipoConta[tipo].sum += ltv

    if (!porMoeda[moeda]) porMoeda[moeda] = { count: 0, sum: 0 }
    porMoeda[moeda].count++
    porMoeda[moeda].sum += ltv

    if (!porPais[pais]) porPais[pais] = { count: 0, sum: 0 }
    porPais[pais].count++
    porPais[pais].sum += ltv

    if (!porVendedor[vendedor]) porVendedor[vendedor] = { count: 0, sum: 0 }
    porVendedor[vendedor].count++
    porVendedor[vendedor].sum += ltv

    porFaixa[faixaCliente(ltv, p33, p66)]++
  }

  const toLtvMedio = (x: { count: number; sum: number }) => ({ count: x.count, ltvMedio: x.count > 0 ? x.sum / x.count : 0 })
  const toLtvMedioReceita = (x: { count: number; sum: number }) => ({ count: x.count, ltvMedio: x.count > 0 ? x.sum / x.count : 0, receitaTotal: x.sum })

  const ltvVsCac = metrics
    .filter((m) => m.ltvCacRatio != null)
    .map((m) => ({
      clientId: m.clientId,
      cliente: m.client?.user?.name ?? m.client?.user?.email ?? 'N/A',
      ltv: Number(m.ltvReal ?? m.revenueTotal),
      cac: Number(m.cac ?? 0),
      ltvCacRatio: Number(m.ltvCacRatio),
    }))
    .sort((a, b) => b.ltvCacRatio - a.ltvCacRatio)
    .slice(0, 50)

  const rankingClientes = metrics
    .map((m) => ({
      clientId: m.clientId,
      cliente: m.client?.user?.name ?? m.client?.user?.email ?? 'N/A',
      pais: m.pais ?? m.client?.country ?? 'N/A',
      ltvBruto: Number(m.revenueTotal),
      ltvReal: Number(m.ltvReal ?? m.revenueTotal),
      ticketMedio: Number(m.ticketMedio),
      segmento: m.segmento,
      churnRisk: m.churnRisk,
    }))
    .sort((a, b) => b.ltvReal - a.ltvReal)
    .slice(0, 100)

  const cohortes = await prisma.cohortMonthly.findMany({
    where: { referenceDate: refDate },
    orderBy: { mesAquisicao: 'asc' },
  })
  const curvaRetencao = cohortes.map((c) => ({
    mesAquisicao: c.mesAquisicao,
    clientesAtivos: c.clientesAtivos,
    retencaoPercentual: c.retencaoPercentual != null ? Number(c.retencaoPercentual) : null,
  }))

  const evolucaoLtvMensal = cohortes.map((c) => ({
    mes: c.mesAquisicao,
    receitaTotal: Number(c.receitaMes1) + Number(c.receitaMes2) + Number(c.receitaMes3),
    clientesAtivos: c.clientesAtivos,
    ltvMedioCoorte: c.clientesAtivos > 0 ? (Number(c.receitaMes1) + Number(c.receitaMes2) + Number(c.receitaMes3)) / c.clientesAtivos : 0,
  }))

  const churned = metrics.filter((m) => m.churnFlag).length
  const churnRate = metrics.length > 0 ? (churned / metrics.length) * 100 : 0
  const retencaoMensal = 100 - churnRate
  const receitaRecorrenteMedia = metrics.reduce((s, m) => s + Number(m.revenueTotal) / Math.max(1, m.mesesRelacionamento), 0) / metrics.length
  const margemLiquidaMedia =
    metrics.reduce((s, m) => s + Number(m.marginTotal), 0) / metrics.length
  const cacMedio =
    metrics.filter((m) => m.cac != null).length > 0
      ? metrics
          .filter((m) => m.cac != null)
          .reduce((s, m) => s + Number(m.cac!), 0) / metrics.filter((m) => m.cac != null).length
      : 0
  const ltvCacRatios = metrics.filter((m) => m.ltvCacRatio != null).map((m) => Number(m.ltvCacRatio!))
  const ltvCacRatioMedio = ltvCacRatios.length > 0 ? ltvCacRatios.reduce((a, b) => a + b, 0) / ltvCacRatios.length : null
  const paybacks = metrics.filter((m) => m.paybackMeses != null).map((m) => Number(m.paybackMeses!))
  const paybackMedio = paybacks.length > 0 ? paybacks.reduce((a, b) => a + b, 0) / paybacks.length : null

  const result: Record<string, { count: number; ltvMedio: number } | { count: number; ltvMedio: number; receitaTotal: number }> = {}
  for (const [k, v] of Object.entries(porTipoConta)) {
    result[k] = { ...toLtvMedioReceita(v), receitaTotal: v.sum }
  }

  return NextResponse.json({
    ltvMedioGeral,
    porTipoConta: Object.fromEntries(Object.entries(porTipoConta).map(([k, v]) => [k, { count: v.count, ltvMedio: toLtvMedio(v).ltvMedio, receitaTotal: v.sum }])),
    porMoeda: Object.fromEntries(Object.entries(porMoeda).map(([k, v]) => [k, { count: v.count, ltvMedio: toLtvMedio(v).ltvMedio }])),
    porPais: Object.fromEntries(Object.entries(porPais).map(([k, v]) => [k, { count: v.count, ltvMedio: toLtvMedio(v).ltvMedio }])),
    porVendedor: Object.fromEntries(Object.entries(porVendedor).map(([k, v]) => [k, { count: v.count, ltvMedio: toLtvMedio(v).ltvMedio, receitaTotal: v.sum }])),
    porFaixa,
    porCanal: { N_A: metrics.length }, // canal de aquisição não implementado no schema
    ltvVsCac,
    rankingClientes,
    curvaRetencao,
    evolucaoLtvMensal,
    metricasComplementares: {
      cacMedio,
      ltvCacRatioMedio,
      paybackMedio,
      churnRate,
      retencaoMensal,
      receitaRecorrenteMedia,
      margemLiquidaMedia,
    },
  })
}
