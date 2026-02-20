/**
 * Motor de cálculo de métricas LTV, CAC, Churn, segmentação
 * Atualização diária via cron
 */
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'

const CHURN_DAYS = 90
const VIP_THRESHOLD = 0.9
const ESTRATEGICO_THRESHOLD = 0.7
const OPORTUNIDADE_THRESHOLD = 0.5
const RISCO_THRESHOLD = 0.3

export type CustomerMetricsInput = {
  clientId: string
  revenueTotal: number
  costTotal: number
  ticketMedio: number
  frequenciaMensal: number
  mesesRelacionamento: number
  diasSemCompra: number
  churnFlag: boolean
}

function calcLtvProjected(ltvActual: number, months: number, churnRate: number): number {
  if (churnRate >= 1) return ltvActual
  const retention = Math.pow(1 - churnRate, months)
  return ltvActual * (1 + retention)
}

function calcChurnRisk(diasSemCompra: number, frequenciaMensal: number): 'BAIXO' | 'MEDIO' | 'ALTO' {
  if (diasSemCompra > 120) return 'ALTO'
  if (diasSemCompra > 60) return 'MEDIO'
  return 'BAIXO'
}

function calcSegmento(
  revenueTotal: number,
  diasSemCompra: number,
  ticketMedio: number,
  mediaTicket: number
): string {
  if (diasSemCompra > CHURN_DAYS) return 'INATIVO'
  if (revenueTotal >= mediaTicket * 5 && diasSemCompra < 30) return 'VIP'
  if (revenueTotal >= mediaTicket * 2) return 'ESTRATEGICO'
  if (diasSemCompra < 60 && ticketMedio >= mediaTicket * 0.8) return 'OPORTUNIDADE'
  if (diasSemCompra > 45) return 'RISCO'
  return 'OPORTUNIDADE'
}

export async function computeAndUpsertCustomerMetrics(): Promise<number> {
  const clients = await prisma.clientProfile.findMany({
    include: {
      user: { select: { id: true } },
      orders: {
        where: { status: { in: ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] }, paidAt: { not: null } },
        select: { value: true, quantity: true, paidAt: true, createdAt: true },
      },
    },
  })

  let upserted = 0
  const refDate = new Date()
  refDate.setHours(0, 0, 0, 0)

  const allRevenues = clients
    .map((c) => c.orders.reduce((s, o) => s + Number(o.value), 0))
    .filter((r) => r > 0)
  const mediaTicket = allRevenues.length > 0
    ? allRevenues.reduce((a, b) => a + b, 0) / allRevenues.length / Math.max(1, clients.filter((c) => c.orders.length > 0).reduce((s, c) => s + c.orders.length, 0) / clients.length)
    : 0

  for (const client of clients) {
    const orders = client.orders
    const revenueTotal = orders.reduce((s, o) => s + Number(o.value), 0)
    const costTotal = 0
    const marginTotal = revenueTotal - costTotal
    const ordersCount = orders.length
    const ticketMedio = ordersCount > 0 ? revenueTotal / ordersCount : 0

    const lastPaidAt = orders
      .map((o) => o.paidAt)
      .filter((d): d is Date => d != null)
      .sort((a, b) => b.getTime() - a.getTime())[0]
    const firstOrder = orders
      .map((o) => o.paidAt ?? o.createdAt)
      .filter((d): d is Date => d != null)
      .sort((a, b) => a.getTime() - b.getTime())[0]

    const now = new Date()
    const diasSemCompra = lastPaidAt
      ? Math.floor((now.getTime() - lastPaidAt.getTime()) / (24 * 60 * 60 * 1000))
      : 999
    const mesesRelacionamento = firstOrder
      ? Math.max(0, Math.floor((now.getTime() - firstOrder.getTime()) / (30 * 24 * 60 * 60 * 1000)))
      : 0
    const churnFlag = diasSemCompra > CHURN_DAYS
    const frequenciaMensal = mesesRelacionamento > 0 && ordersCount > 0
      ? ordersCount / mesesRelacionamento
      : ordersCount

    const ltvBruto = revenueTotal
    const ltvLiquido = marginTotal

    const segmento = calcSegmento(revenueTotal, diasSemCompra, ticketMedio, mediaTicket || 1)
    const churnRisk = calcChurnRisk(diasSemCompra, frequenciaMensal)
    const churnRate = diasSemCompra > 90 ? 0.3 : diasSemCompra > 60 ? 0.15 : 0.05

    const ltvProjetado3m = calcLtvProjected(ltvLiquido, 3, churnRate)
    const ltvProjetado6m = calcLtvProjected(ltvLiquido, 6, churnRate)
    const ltvProjetado12m = calcLtvProjected(ltvLiquido, 12, churnRate)

    const scoreValor = Math.min(100, Math.round((revenueTotal / Math.max(mediaTicket * 10, 1)) * 10))
    const scoreRisco = Math.min(100, Math.round((diasSemCompra / 180) * 100))
    const scoreFidelidade = Math.min(100, Math.round((1 - diasSemCompra / 180) * 100))

    await prisma.customerMetrics.upsert({
      where: { clientId: client.id },
      create: {
        clientId: client.id,
        referenceDate: refDate,
        revenueTotal: new Decimal(revenueTotal),
        costTotal: new Decimal(costTotal),
        marginTotal: new Decimal(marginTotal),
        ticketMedio: new Decimal(ticketMedio),
        frequenciaMensal: new Decimal(frequenciaMensal),
        mesesRelacionamento,
        churnFlag,
        diasSemCompra,
        ltvBruto: new Decimal(ltvBruto),
        ltvLiquido: new Decimal(ltvLiquido),
        ltvProjetado3m: new Decimal(ltvProjetado3m),
        ltvProjetado6m: new Decimal(ltvProjetado6m),
        ltvProjetado12m: new Decimal(ltvProjetado12m),
        scoreValor,
        scoreRisco,
        scoreFidelidade,
        segmento,
        churnRisk,
      },
      update: {
        referenceDate: refDate,
        revenueTotal: new Decimal(revenueTotal),
        costTotal: new Decimal(costTotal),
        marginTotal: new Decimal(marginTotal),
        ticketMedio: new Decimal(ticketMedio),
        frequenciaMensal: new Decimal(frequenciaMensal),
        mesesRelacionamento,
        churnFlag,
        diasSemCompra,
        ltvBruto: new Decimal(ltvBruto),
        ltvLiquido: new Decimal(ltvLiquido),
        ltvProjetado3m: new Decimal(ltvProjetado3m),
        ltvProjetado6m: new Decimal(ltvProjetado6m),
        ltvProjetado12m: new Decimal(ltvProjetado12m),
        scoreValor,
        scoreRisco,
        scoreFidelidade,
        segmento,
        churnRisk,
      },
    })
    upserted++
  }

  return upserted
}
