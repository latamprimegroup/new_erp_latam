/**
 * Motor de Inteligência Estratégica
 * LTV completo, CAC, Payback, Churn probabilístico, LTV forecast
 */
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'

const CHURN_DAYS_INATIVO = 90
const LTV_CAC_RISCO = 3
const LTV_CAC_EXCELENTE = 5

/** Probabilidade de churn (modelo heurístico baseado em features) */
export function calcChurnProbability(features: {
  diasSemCompra: number
  frequenciaMensal: number
  variacaoTicket: number
  historicoReposicao: number
  margem: number
  mesesRelacionamento: number
}): number {
  let prob = 0
  if (features.diasSemCompra > 120) prob += 50
  else if (features.diasSemCompra > 90) prob += 40
  else if (features.diasSemCompra > 60) prob += 25
  else if (features.diasSemCompra > 45) prob += 15
  if (features.frequenciaMensal < 0.2 && features.mesesRelacionamento > 3) prob += 20
  if (features.historicoReposicao > 0) prob += 10
  if (features.margem < 0) prob += 15
  return Math.min(100, Math.round(prob))
}

/** Classificação de risco de churn */
export function classifyChurnRisk(probability: number): 'BAIXO' | 'MEDIO' | 'ALTO' {
  if (probability < 20) return 'BAIXO'
  if (probability < 50) return 'MEDIO'
  return 'ALTO'
}

/** LTV projetado = ticket × freq × tempo_retencao_estimado */
export function calcLtvForecast(
  ticketMedio: number,
  frequenciaMensal: number,
  churnProb: number,
  meses: number
): number {
  const retencaoMensal = 1 - churnProb / 100
  let acum = 0
  for (let m = 0; m < meses; m++) {
    acum += ticketMedio * frequenciaMensal * Math.pow(retencaoMensal, m)
  }
  return acum
}

/** Segmento automático */
export function classifySegment(
  ltv: number,
  mediaLtv: number,
  churnProb: number,
  diasSemCompra: number,
  ticketMedio: number,
  mediaTicket: number
): string {
  if (diasSemCompra > CHURN_DAYS_INATIVO) return 'INATIVO'
  if (churnProb > 50) return 'RISCO'
  if (ltv >= mediaLtv * 1.5 && churnProb < 20 && diasSemCompra < 30) return 'VIP'
  if (ltv >= mediaLtv && churnProb < 30) return 'ESTRATEGICO'
  if (ticketMedio >= mediaTicket * 0.8 && diasSemCompra < 60) return 'OPORTUNIDADE'
  return 'OPORTUNIDADE'
}

/** Custo estimado por reposição quando não há lançamento financeiro */
const CUSTO_ESTIMADO_REPOSICAO = 200

export async function computeFullCustomerMetrics(): Promise<number> {
  const clients = await prisma.clientProfile.findMany({
    include: {
      user: { select: { id: true } },
      orders: {
        where: { status: { in: ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] }, paidAt: { not: null } },
        select: { id: true, value: true, quantity: true, paidAt: true, createdAt: true, sellerId: true, country: true, currency: true, accountType: true },
      },
      deliveryGroups: { select: { id: true } },
    },
  })

  const orderIds = clients.flatMap((c) => c.orders.map((o) => o.id))
  const [financialCosts, repositionCounts] = await Promise.all([
    prisma.financialEntry.findMany({
      where: { orderId: { in: orderIds }, type: 'EXPENSE' },
      select: { orderId: true, value: true, category: true },
    }),
    prisma.deliveryReposition.groupBy({
      by: ['deliveryId'],
      where: {
        delivery: { clientId: { in: clients.map((c) => c.id) } },
        status: { in: ['APROVADA', 'CONCLUIDA'] },
      },
      _count: { id: true },
    }),
  ])

  const deliveryToClient = new Map<string, string>()
  for (const c of clients) {
    for (const dg of c.deliveryGroups) deliveryToClient.set(dg.id, c.id)
  }
  const orderIdToClientId = new Map<string, string>()
  for (const c of clients) {
    for (const o of c.orders) orderIdToClientId.set(o.id, c.id)
  }
  const custoPorCliente = new Map<string, { custoOperacional: number; reposicao: number; desconto: number; chargeback: number }>()
  for (const fe of financialCosts) {
    if (!fe.orderId) continue
    const clientId = orderIdToClientId.get(fe.orderId)
    if (!clientId) continue
    const cat = (fe.category ?? '').toLowerCase()
    const val = Number(fe.value)
    const cur = custoPorCliente.get(clientId) ?? { custoOperacional: 0, reposicao: 0, desconto: 0, chargeback: 0 }
    if (cat.includes('reposi') || cat.includes('troca')) cur.reposicao += val
    else if (cat.includes('chargeback') || cat.includes('charge')) cur.chargeback += val
    else if (cat.includes('desconto')) cur.desconto += val
    else cur.custoOperacional += val
    custoPorCliente.set(clientId, cur)
  }
  const reposicaoPorCliente = new Map<string, number>()
  for (const r of repositionCounts) {
    const clientId = deliveryToClient.get(r.deliveryId)
    if (clientId) {
      const qty = r._count.id
      reposicaoPorCliente.set(clientId, (reposicaoPorCliente.get(clientId) ?? 0) + qty)
    }
  }

  const refDate = new Date()
  refDate.setHours(0, 0, 0, 0)
  const now = new Date()

  const allRevenues = clients.flatMap((c) => c.orders.map((o) => Number(o.value)))
  const mediaTicket = allRevenues.length > 0 ? allRevenues.reduce((a, b) => a + b, 0) / allRevenues.length : 2000
  const allLtvs = clients.map((c) => c.orders.reduce((s, o) => s + Number(o.value), 0)).filter((r) => r > 0)
  const mediaLtv = allLtvs.length > 0 ? allLtvs.reduce((a, b) => a + b, 0) / allLtvs.length : 0

  const custoMarketing = 0
  const custoComercial = 0
  const novosClientes = clients.filter((c) => {
    const first = c.orders.map((o) => o.paidAt).filter((d): d is Date => d != null).sort((a, b) => a.getTime() - b.getTime())[0]
    return first && (now.getTime() - first.getTime()) / (30 * 24 * 60 * 60 * 1000) < 1
  }).length
  const cacGlobal = novosClientes > 0 ? (custoMarketing + custoComercial) / novosClientes : 0

  let count = 0
  for (const client of clients) {
    const orders = client.orders
    const revenueTotal = orders.reduce((s, o) => s + Number(o.value), 0)
    const custoFin = custoPorCliente.get(client.id) ?? { custoOperacional: 0, reposicao: 0, desconto: 0, chargeback: 0 }
    let reposicoes = custoFin.reposicao
    const qtyRepos = reposicaoPorCliente.get(client.id) ?? 0
    if (qtyRepos > 0 && reposicoes === 0) reposicoes = qtyRepos * CUSTO_ESTIMADO_REPOSICAO
    const costos = custoFin.custoOperacional
    const descontos = custoFin.desconto
    const chargebacks = custoFin.chargeback
    const custoTotal = costos + reposicoes + descontos + chargebacks
    const marginTotal = revenueTotal - custoTotal
    const ltvBruto = revenueTotal
    const ltvLiquido = marginTotal - costos - reposicoes - descontos - chargebacks
    const ltvReal = marginTotal

    const firstOrder = orders.map((o) => o.paidAt ?? o.createdAt).filter((d): d is Date => d != null).sort((a, b) => a.getTime() - b.getTime())[0]
    const lastOrder = orders.map((o) => o.paidAt).filter((d): d is Date => d != null).sort((a, b) => b.getTime() - a.getTime())[0]

    const dataPrimeiraCompra = firstOrder ?? null
    const tempoRelacionamentoDias = firstOrder ? Math.floor((now.getTime() - firstOrder.getTime()) / (24 * 60 * 60 * 1000)) : 0
    const mesesRelacionamento = Math.floor(tempoRelacionamentoDias / 30)
    const diasSemCompra = lastOrder ? Math.floor((now.getTime() - lastOrder.getTime()) / (24 * 60 * 60 * 1000)) : 999
    const churnFlag = diasSemCompra > CHURN_DAYS_INATIVO

    const ordersCount = orders.length
    const ticketMedio = ordersCount > 0 ? revenueTotal / ordersCount : 0
    const frequenciaMensal = mesesRelacionamento > 0 ? ordersCount / mesesRelacionamento : ordersCount

    const variacaoTicket = 0
    const historicoReposicao = qtyRepos
    const churnProb = calcChurnProbability({
      diasSemCompra,
      frequenciaMensal,
      variacaoTicket,
      historicoReposicao,
      margem: marginTotal,
      mesesRelacionamento,
    })
    const churnRisk = classifyChurnRisk(churnProb)
    const segmento = classifySegment(revenueTotal, mediaLtv, churnProb, diasSemCompra, ticketMedio, mediaTicket)

    const ltvProj3 = calcLtvForecast(ticketMedio, frequenciaMensal, churnProb, 3)
    const ltvProj6 = calcLtvForecast(ticketMedio, frequenciaMensal, churnProb, 6)
    const ltvProj12 = calcLtvForecast(ticketMedio, frequenciaMensal, churnProb, 12)

    const firstOrderData = firstOrder ?? null
    const sellerId = orders.find((o) => o.sellerId)?.sellerId ?? null
    const pais = orders.find((o) => o.country)?.country ?? client.country ?? null
    const moeda = orders.find((o) => o.currency)?.currency ?? 'BRL'
    const tipoConta = orders.find((o) => o.accountType)?.accountType ?? null

    const cac = cacGlobal
    const margemMensalMedia = mesesRelacionamento > 0 ? marginTotal / mesesRelacionamento : marginTotal
    const paybackMeses = margemMensalMedia > 0 && cac > 0 ? cac / margemMensalMedia : null
    const ltvCacRatio = cac > 0 ? ltvReal / cac : null

    const scoreValor = mediaLtv > 0 ? Math.min(100, Math.round((revenueTotal / mediaLtv) * 20)) : 50
    const scoreRisco = Math.min(100, churnProb)
    const scoreFidelidade = Math.min(100, Math.max(0, 100 - diasSemCompra / 2))

    await prisma.customerMetrics.upsert({
      where: { clientId: client.id },
      create: {
        clientId: client.id,
        referenceDate: refDate,
        dataPrimeiraCompra,
        revenueTotal: new Decimal(revenueTotal),
        costTotal: new Decimal(custoTotal),
        marginTotal: new Decimal(marginTotal),
        ticketMedio: new Decimal(ticketMedio),
        frequenciaMensal: new Decimal(frequenciaMensal),
        mesesRelacionamento,
        tempoRelacionamentoDias,
        churnFlag,
        diasSemCompra,
        ltvBruto: new Decimal(ltvBruto),
        ltvLiquido: new Decimal(ltvLiquido),
        ltvReal: new Decimal(ltvReal),
        ltvProjetado3m: new Decimal(ltvProj3),
        ltvProjetado6m: new Decimal(ltvProj6),
        ltvProjetado12m: new Decimal(ltvProj12),
        cac: new Decimal(cac),
        ltvCacRatio: ltvCacRatio != null ? new Decimal(ltvCacRatio) : null,
        paybackMeses: paybackMeses != null ? new Decimal(paybackMeses) : null,
        churnProbability: new Decimal(churnProb),
        scoreValor,
        scoreRisco,
        scoreFidelidade,
        segmento,
        churnRisk,
        vendedorId: sellerId,
        pais,
        moeda,
        tipoConta,
      },
      update: {
        referenceDate: refDate,
        dataPrimeiraCompra,
        revenueTotal: new Decimal(revenueTotal),
        costTotal: new Decimal(custoTotal),
        marginTotal: new Decimal(marginTotal),
        ticketMedio: new Decimal(ticketMedio),
        frequenciaMensal: new Decimal(frequenciaMensal),
        mesesRelacionamento,
        tempoRelacionamentoDias,
        churnFlag,
        diasSemCompra,
        ltvBruto: new Decimal(ltvBruto),
        ltvLiquido: new Decimal(ltvLiquido),
        ltvReal: new Decimal(ltvReal),
        ltvProjetado3m: new Decimal(ltvProj3),
        ltvProjetado6m: new Decimal(ltvProj6),
        ltvProjetado12m: new Decimal(ltvProj12),
        cac: new Decimal(cac),
        ltvCacRatio: ltvCacRatio != null ? new Decimal(ltvCacRatio) : null,
        paybackMeses: paybackMeses != null ? new Decimal(paybackMeses) : null,
        churnProbability: new Decimal(churnProb),
        scoreValor,
        scoreRisco,
        scoreFidelidade,
        segmento,
        churnRisk,
        vendedorId: sellerId,
        pais,
        moeda,
        tipoConta,
      },
    })
    count++
  }
  return count
}
