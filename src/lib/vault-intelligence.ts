/**
 * Vault Intelligence — margem, CMV, provisão de payout, liquidez (centavos via Prisma Decimal).
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getProductionConfig } from '@/lib/production-payment'

export const VAULT_PAID_STATUSES = ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] as const

export function dec(n: number | string | Prisma.Decimal | null | undefined): Prisma.Decimal {
  return new Prisma.Decimal(n ?? 0)
}

export async function vaultSettingNum(key: string, fallback: number): Promise<number> {
  const s = await prisma.systemSetting.findUnique({ where: { key } })
  if (!s?.value) return fallback
  const n = parseFloat(s.value)
  return Number.isFinite(n) ? n : fallback
}

export type MonthRange = { start: Date; end: Date }

export function monthRange(year: number, month: number): MonthRange {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0)
  const end = new Date(year, month, 0, 23, 59, 59, 999)
  return { start, end }
}

/** Faturamento pago no período + CMV estimado (purchasePrice nas contas vendidas). */
export async function revenueAndCogs(range: MonthRange): Promise<{
  revenue: Prisma.Decimal
  cogs: Prisma.Decimal
  orderCount: number
}> {
  const orders = await prisma.order.findMany({
    where: {
      status: { in: [...VAULT_PAID_STATUSES] },
      paidAt: { gte: range.start, lte: range.end },
    },
    select: {
      value: true,
      items: { select: { account: { select: { purchasePrice: true } } } },
    },
  })
  let revenue = dec(0)
  let cogs = dec(0)
  const defaultUnit = dec(await vaultSettingNum('vault_default_cogs_per_unit', 0))
  for (const o of orders) {
    revenue = revenue.add(o.value)
    for (const it of o.items) {
      const pp = it.account.purchasePrice
      cogs = cogs.add(pp != null ? dec(pp) : defaultUnit)
    }
  }
  return { revenue, cogs, orderCount: orders.length }
}

export async function gatewayFeeEstimate(revenue: Prisma.Decimal): Promise<Prisma.Decimal> {
  const pct = await vaultSettingNum('vault_gateway_fee_pct', 2.9)
  return revenue.mul(pct).div(100)
}

/** Provisão simplificada: (contas validadas no mês) × valor por conta + elite × bônus. */
export async function payoutProvisionEstimate(range: MonthRange): Promise<{
  productionUnits: number
  g2Units: number
  eliteUnits: number
  provisionBase: Prisma.Decimal
  provisionElite: Prisma.Decimal
  total: Prisma.Decimal
}> {
  const cfg = await getProductionConfig()
  const per = dec(cfg.valorPorConta)
  const elite = dec(cfg.bonusElite)

  const [productionUnits, g2Units] = await Promise.all([
    prisma.productionAccount.count({
      where: {
        status: 'APPROVED',
        deletedAt: null,
        validatedAt: { gte: range.start, lte: range.end },
      },
    }),
    prisma.productionG2.count({
      where: {
        deletedAt: null,
        validatedAt: { gte: range.start, lte: range.end },
      },
    }),
  ])

  const survivalCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const eliteUnits = await prisma.productionG2.count({
    where: {
      deletedAt: null,
      validatedAt: { gte: range.start, lte: range.end },
      stockAccountId: { not: null },
      stockAccount: {
        deliveredAt: { not: null, lte: survivalCutoff },
        status: { in: ['IN_USE', 'DELIVERED', 'CRITICAL'] },
      },
    },
  })

  const provisionBase = per.mul(productionUnits + g2Units)
  const provisionElite = elite.mul(eliteUnits)
  return {
    productionUnits,
    g2Units,
    eliteUnits,
    provisionBase,
    provisionElite,
    total: provisionBase.add(provisionElite),
  }
}

export async function contributionMarginReal(range: MonthRange): Promise<{
  /** Faturamento pago no período (pedidos) — receita bruta operacional */
  receitaBruta: number
  /** Mesmo que receitaBruta (alias para dashboards) */
  revenue: number
  gatewayFees: number
  /** Valor que “entra” após descontar taxas de gateway (Pix/cartão estimado) */
  receitaLiquidaAposGateway: number
  cogs: number
  payoutProvision: number
  contributionMargin: number
  /** Margem sobre receita líquida pós-gateway */
  marginPct: number
}> {
  const { revenue, cogs } = await revenueAndCogs(range)
  const gateway = await gatewayFeeEstimate(revenue)
  const { total: payout } = await payoutProvisionEstimate(range)
  const margin = revenue.sub(gateway).sub(cogs).sub(payout)
  const revN = revenue.toNumber()
  const gtw = gateway.toNumber()
  const liq = revN - gtw
  const marginN = margin.toNumber()
  return {
    receitaBruta: revN,
    revenue: revN,
    gatewayFees: gtw,
    receitaLiquidaAposGateway: liq,
    cogs: cogs.toNumber(),
    payoutProvision: payout.toNumber(),
    contributionMargin: marginN,
    marginPct: liq > 0 ? Math.round((marginN / liq) * 1000) / 10 : revN > 0 ? Math.round((marginN / revN) * 1000) / 10 : 0,
  }
}

export async function breakEvenSignal(range: MonthRange): Promise<{
  fixedCostsMonthly: number
  grossAccumulated: number
  inNetProfitZone: boolean
  gapToBreakEven: number
}> {
  const fixed = await vaultSettingNum('vault_fixed_costs_monthly', 0)
  const { revenue, gatewayFees, cogs, payoutProvision } = await contributionMarginReal(range)
  const gross = revenue - gatewayFees - cogs - payoutProvision
  return {
    fixedCostsMonthly: fixed,
    grossAccumulated: gross,
    inNetProfitZone: gross >= fixed,
    gapToBreakEven: Math.max(0, fixed - gross),
  }
}

export async function accountsReceivablePending(): Promise<{ count: number; value: number }> {
  const pending = await prisma.order.aggregate({
    where: { status: { in: ['AWAITING_PAYMENT', 'PENDING', 'APPROVED'] } },
    _sum: { value: true },
    _count: true,
  })
  return {
    count: pending._count,
    value: Number(pending._sum.value ?? 0),
  }
}

export async function pendingWithdrawalsTotal(): Promise<number> {
  const w = await prisma.withdrawal.aggregate({
    where: { status: { in: ['PENDING', 'PROCESSING', 'HELD'] } },
    _sum: { netValue: true },
  })
  return Number(w._sum.netValue ?? 0)
}

/** Despesas lançadas para “amanhã” + saques com vencimento amanhã (previsibilidade de caixa). */
export async function payablesDueTomorrow(): Promise<{
  expensesScheduled: number
  withdrawalsDue: number
  total: number
  expenseCount: number
  withdrawalCount: number
}> {
  const base = new Date()
  base.setDate(base.getDate() + 1)
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0)
  const end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59, 999)

  const [expAgg, expCount, wdAgg, wdCount] = await Promise.all([
    prisma.financialEntry.aggregate({
      where: { type: 'EXPENSE', date: { gte: start, lte: end } },
      _sum: { value: true },
    }),
    prisma.financialEntry.count({
      where: { type: 'EXPENSE', date: { gte: start, lte: end } },
    }),
    prisma.withdrawal.aggregate({
      where: {
        status: { in: ['PENDING', 'PROCESSING', 'HELD'] },
        dueDate: { gte: start, lte: end },
      },
      _sum: { netValue: true },
    }),
    prisma.withdrawal.count({
      where: {
        status: { in: ['PENDING', 'PROCESSING', 'HELD'] },
        dueDate: { gte: start, lte: end },
      },
    }),
  ])

  const expensesScheduled = Number(expAgg._sum.value ?? 0)
  const withdrawalsDue = Number(wdAgg._sum.netValue ?? 0)
  return {
    expensesScheduled,
    withdrawalsDue,
    total: expensesScheduled + withdrawalsDue,
    expenseCount: expCount,
    withdrawalCount: wdCount,
  }
}

/** Série simples de fluxo: caixa registrado em FinancialEntry vs a receber (pedidos). */
export async function cashFlowSeries(days: number): Promise<
  {
    date: string
    cashNet: number
    receivable: number
    payablesEstimate: number
    /** Preenchido só na linha do dia atual: despesas/saques com vencimento amanhã */
    payablesTomorrow?: number
  }[]
> {
  const out: {
    date: string
    cashNet: number
    receivable: number
    payablesEstimate: number
    payablesTomorrow?: number
  }[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
    const [inc, exp, ar] = await Promise.all([
      prisma.financialEntry.aggregate({
        where: { type: 'INCOME', date: { gte: start, lte: end } },
        _sum: { value: true },
      }),
      prisma.financialEntry.aggregate({
        where: { type: 'EXPENSE', date: { gte: start, lte: end } },
        _sum: { value: true },
      }),
      i === 0
        ? accountsReceivablePending()
        : Promise.resolve({ count: 0, value: 0 }),
    ])
    const cashNet = Number(inc._sum.value ?? 0) - Number(exp._sum.value ?? 0)
    let payTomorrow: number | undefined
    if (i === 0) {
      const t = await payablesDueTomorrow()
      payTomorrow = t.total
    }
    out.push({
      date: start.toISOString().slice(0, 10),
      cashNet,
      receivable: i === 0 ? ar.value : 0,
      payablesEstimate: i === 0 ? await pendingWithdrawalsTotal() : 0,
      payablesTomorrow: payTomorrow,
    })
  }
  return out
}

export async function garantiaCostVsRevenue(range: MonthRange): Promise<{
  repositionUnits: number
  estimatedCost: number
  revenue: number
  pctOfRevenue: number
  alertLowQuality: boolean
}> {
  const unitCost = await vaultSettingNum('vault_reposition_unit_cost', 150)
  const alertPct = await vaultSettingNum('vault_garantia_alert_pct', 5)
  const done = await prisma.deliveryReposition.count({
    where: {
      status: 'CONCLUIDA',
      resolvedAt: { gte: range.start, lte: range.end },
    },
  })
  const { revenue } = await revenueAndCogs(range)
  const revN = revenue.toNumber()
  const estimatedCost = done * unitCost
  const pct = revN > 0 ? (estimatedCost / revN) * 100 : 0
  return {
    repositionUnits: done,
    estimatedCost,
    revenue: revN,
    pctOfRevenue: Math.round(pct * 10) / 10,
    alertLowQuality: pct >= alertPct,
  }
}

export async function supplyRenewalAlerts(withinDays = 14): Promise<
  { id: string; label: string; category: string; expiresAt: string; unitsRemaining: number }[]
> {
  const limit = new Date()
  limit.setDate(limit.getDate() + withinDays)
  const lots = await prisma.supplyLot.findMany({
    where: {
      expiresAt: { not: null, lte: limit, gte: new Date() },
      unitsRemaining: { gt: 0 },
    },
    orderBy: { expiresAt: 'asc' },
    take: 50,
  })
  return lots.map((l) => ({
    id: l.id,
    label: l.label,
    category: l.category,
    expiresAt: l.expiresAt!.toISOString(),
    unitsRemaining: l.unitsRemaining,
  }))
}

export async function dreVaultLines(range: MonthRange): Promise<{
  faturamentoBruto: number
  impostosEstimados: number
  cmv: number
  taxasGateway: number
  payoutsProvisao: number
  despesasOperacionais: number
  lucroLiquidoReal: number
}> {
  const d = await dreVaultDemonstrativo(range)
  return {
    faturamentoBruto: d.faturamentoBruto,
    impostosEstimados: d.detalheImpostos,
    cmv: d.detalheCmv,
    taxasGateway: d.detalheTaxasGateway,
    payoutsProvisao: d.detalhePayouts,
    despesasOperacionais: d.despesasOperacionais,
    lucroLiquidoReal: d.lucroLiquidoReal,
  }
}

/**
 * DRE no formato executivo: bruto → (-) impostos+taxas → (-) CMV+payouts → lucro bruto → (-) OPEX → líquido.
 */
export async function dreVaultDemonstrativo(range: MonthRange): Promise<{
  faturamentoBruto: number
  impostosETaxasCartao: number
  detalheImpostos: number
  detalheTaxasGateway: number
  custosProducaoInsumosPayouts: number
  detalheCmv: number
  detalhePayouts: number
  lucroBruto: number
  despesasOperacionais: number
  lucroLiquidoReal: number
}> {
  const { revenue, cogs } = await revenueAndCogs(range)
  const gateway = await gatewayFeeEstimate(revenue)
  const { total: payout } = await payoutProvisionEstimate(range)
  const taxPct = await vaultSettingNum('vault_tax_estimate_pct', 0)
  const impostos = revenue.mul(taxPct).div(100)
  const opexRows = await prisma.financialEntry.aggregate({
    where: {
      AND: [
        { type: 'EXPENSE' },
        { date: { gte: range.start, lte: range.end } },
        { NOT: { category: { startsWith: 'GARANTIA' } } },
      ],
    },
    _sum: { value: true },
  })
  const despesasOp = dec(opexRows._sum.value ?? 0)
  const fb = revenue.toNumber()
  const impN = impostos.toNumber()
  const gtwN = gateway.toNumber()
  const cmvN = cogs.toNumber()
  const payN = payout.toNumber()
  const impostosETaxas = impN + gtwN
  const custosProducao = cmvN + payN
  const lucroBruto = fb - impostosETaxas - custosProducao
  const opexN = despesasOp.toNumber()
  const lucroLiquido = lucroBruto - opexN

  return {
    faturamentoBruto: fb,
    impostosETaxasCartao: impostosETaxas,
    detalheImpostos: impN,
    detalheTaxasGateway: gtwN,
    custosProducaoInsumosPayouts: custosProducao,
    detalheCmv: cmvN,
    detalhePayouts: payN,
    lucroBruto,
    despesasOperacionais: opexN,
    lucroLiquidoReal: lucroLiquido,
  }
}

export function assertBalancedJournal(lines: { debit: Prisma.Decimal; credit: Prisma.Decimal }[]) {
  const td = lines.reduce((s, l) => s.add(l.debit), dec(0))
  const tc = lines.reduce((s, l) => s.add(l.credit), dec(0))
  if (!td.equals(tc)) {
    throw new Error(`Lançamento desbalanceado: débito ${td} ≠ crédito ${tc}`)
  }
}
