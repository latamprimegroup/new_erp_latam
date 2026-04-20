import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import type { AccountPlatform, Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { parseDashboardPlatformParam } from '@/lib/account-platform-query'
import { prisma } from '@/lib/prisma'
import {
  calculateMonthlyAmount,
  getProductionConfig,
  getProducerAvailableBalance,
  type ProductionPaymentConfig,
} from '@/lib/production-payment'
import { nextTierProgress } from '@/lib/production-bonus-math'

const PAID_STATUSES = ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] as const
const G2_DONE = ['APROVADA', 'ENVIADA_ESTOQUE'] as const

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role === 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const pf = parseDashboardPlatformParam(req.nextUrl.searchParams.get('platform'))
  const isAdmin = session.user?.role === 'ADMIN'
  const isProducer = session.user?.role === 'PRODUCER'
  const producerUserId = isProducer ? session.user!.id! : null

  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  const sevenAgo = new Date(now)
  sevenAgo.setDate(sevenAgo.getDate() - 7)
  sevenAgo.setHours(0, 0, 0, 0)

  const stockBase: Prisma.StockAccountWhereInput = {
    status: 'AVAILABLE' as const,
    deletedAt: null,
    archivedAt: null,
    ...(pf ? { platform: pf as AccountPlatform } : {}),
  }
  if (producerUserId) {
    stockBase.OR = [
      { productionAccount: { producerId: producerUserId } },
      { productionG2: { creatorId: producerUserId } },
    ]
  }

  /** Contas aprovadas e conferidas (validatedAt) — alinhado a métricas / saldo do produtor */
  const prodDailyWhere = {
    deletedAt: null,
    status: 'APPROVED' as const,
    validatedAt: { not: null, gte: startOfDay },
    ...(producerUserId ? { producerId: producerUserId } : {}),
    ...(pf ? { platform: pf as AccountPlatform } : {}),
  }
  const prodMonthWhere = {
    deletedAt: null,
    status: 'APPROVED' as const,
    validatedAt: { not: null, gte: startOfMonth, lte: endOfMonth },
    ...(producerUserId ? { producerId: producerUserId } : {}),
    ...(pf ? { platform: pf as AccountPlatform } : {}),
  }

  const g2DailyWhere = {
    archivedAt: null,
    deletedAt: null,
    status: { in: [...G2_DONE] },
    validatedAt: { not: null, gte: startOfDay },
    ...(producerUserId ? { creatorId: producerUserId } : {}),
  }
  const g2MonthWhere = {
    archivedAt: null,
    deletedAt: null,
    status: { in: [...G2_DONE] },
    validatedAt: { not: null, gte: startOfMonth, lte: endOfMonth },
    ...(producerUserId ? { creatorId: producerUserId } : {}),
  }

  const rejectedWhere = {
    deletedAt: null,
    status: 'REJECTED' as const,
    updatedAt: { gte: startOfMonth, lte: endOfMonth },
    ...(producerUserId ? { producerId: producerUserId } : {}),
    ...(pf ? { platform: pf as AccountPlatform } : {}),
  }

  const producerStockAttribution = (uid: string) => ({
    deletedAt: null,
    OR: [
      { productionAccount: { producerId: uid } },
      { productionG2: { creatorId: uid } },
    ],
    ...(pf ? { platform: pf as AccountPlatform } : {}),
  })

  const ordersSoldQuery =
    isProducer && producerUserId
      ? prisma.orderItem.aggregate({
          where: {
            account: producerStockAttribution(producerUserId),
            order: {
              status: { in: [...PAID_STATUSES] },
              paidAt: { gte: startOfMonth, lte: endOfMonth },
            },
          },
          _sum: { quantity: true },
        })
      : pf
        ? prisma.orderItem.aggregate({
            where: {
              account: { platform: pf },
              order: {
                status: { in: [...PAID_STATUSES] },
                paidAt: { gte: startOfMonth, lte: endOfMonth },
              },
            },
            _sum: { quantity: true },
          })
        : prisma.order.aggregate({
            where: {
              status: { in: [...PAID_STATUSES] },
              paidAt: { gte: startOfMonth, lte: endOfMonth },
            },
            _sum: { quantity: true },
          })

  const ordersDeliveredQuery =
    isProducer && producerUserId
      ? prisma.orderItem.aggregate({
          where: {
            account: producerStockAttribution(producerUserId),
            order: {
              status: 'DELIVERED',
              paidAt: { gte: startOfMonth, lte: endOfMonth },
            },
          },
          _sum: { quantity: true },
        })
      : pf
        ? prisma.orderItem.aggregate({
            where: {
              account: { platform: pf },
              order: {
                status: 'DELIVERED',
                paidAt: { gte: startOfMonth, lte: endOfMonth },
              },
            },
            _sum: { quantity: true },
          })
        : prisma.order.aggregate({
            where: { status: 'DELIVERED', paidAt: { gte: startOfMonth, lte: endOfMonth } },
            _sum: { quantity: true },
          })

  const sold7dQuery = prisma.orderItem.aggregate({
    where: {
      ...(pf ? { account: { platform: pf } } : {}),
      order: {
        paidAt: { gte: sevenAgo, lte: now },
        status: { in: [...PAID_STATUSES] },
      },
    },
    _sum: { quantity: true },
  })

  const [
    productionAccountDaily,
    productionAccountMonthly,
    g2DailyCount,
    g2MonthlyCount,
    stockCount,
    ordersSoldResult,
    ordersDeliveredResult,
    financialMonth,
    financialTotal,
    bonusReleased,
    metaProducao,
    metaVendas,
    productionRejectedMonth,
    sold7dResult,
    pendingWithdrawals,
    producerValidatedProd,
    producerValidatedG2,
    producerBalance,
    producerPaymentConfig,
    producerRevenueAttributed,
    producerApprovalRankWeek,
    producerBonusHistory,
  ] = await Promise.all([
    prisma.productionAccount.count({ where: prodDailyWhere }),
    prisma.productionAccount.count({ where: prodMonthWhere }),
    prisma.productionG2.count({ where: g2DailyWhere }),
    prisma.productionG2.count({ where: g2MonthWhere }),
    prisma.stockAccount.count({ where: stockBase }),
    ordersSoldQuery,
    ordersDeliveredQuery,
    prisma.financialEntry.groupBy({
      by: ['type'],
      where: { date: { gte: startOfMonth, lte: endOfMonth } },
      _sum: { value: true },
    }),
    prisma.financialEntry.groupBy({
      by: ['type'],
      _sum: { value: true },
    }),
    prisma.bonusRelease.aggregate({
      where: { status: 'released' },
      _sum: { value: true },
    }),
    prisma.systemSetting.findUnique({ where: { key: 'meta_producao_mensal' } }),
    prisma.systemSetting.findUnique({ where: { key: 'meta_vendas_mensal' } }),
    prisma.productionAccount.count({ where: rejectedWhere }),
    sold7dQuery,
    isAdmin
      ? prisma.withdrawal.count({ where: { status: { in: ['PENDING', 'HELD'] } } })
      : Promise.resolve(0),
    isProducer
      ? prisma.productionAccount.count({
          where: {
            producerId: producerUserId!,
            status: 'APPROVED',
            deletedAt: null,
            validatedAt: { not: null, gte: startOfMonth, lte: endOfMonth },
            ...(pf ? { platform: pf as AccountPlatform } : {}),
          },
        })
      : Promise.resolve(0),
    isProducer
      ? prisma.productionG2.count({
          where: {
            creatorId: producerUserId!,
            status: { in: [...G2_DONE] },
            archivedAt: null,
            validatedAt: { not: null, gte: startOfMonth, lte: endOfMonth },
          },
        })
      : Promise.resolve(0),
    isProducer ? getProducerAvailableBalance(producerUserId!) : Promise.resolve(0),
    isProducer ? getProductionConfig() : Promise.resolve(null as ProductionPaymentConfig | null),
    isProducer && producerUserId
      ? (async () => {
          const items = await prisma.orderItem.findMany({
            where: {
              account: producerStockAttribution(producerUserId),
              order: {
                status: { in: [...PAID_STATUSES] },
                paidAt: { gte: startOfMonth, lte: endOfMonth },
              },
            },
            select: {
              quantity: true,
              orderId: true,
              order: { select: { id: true, value: true } },
            },
          })
          if (items.length === 0) return 0
          const orderIds = [...new Set(items.map((i) => i.orderId))]
          const sums = await prisma.orderItem.groupBy({
            by: ['orderId'],
            where: { orderId: { in: orderIds } },
            _sum: { quantity: true },
          })
          const qMap = Object.fromEntries(sums.map((s) => [s.orderId, s._sum.quantity || 1]))
          let total = 0
          for (const it of items) {
            const qo = qMap[it.orderId] || 1
            total += Number(it.order.value) * (it.quantity / qo)
          }
          return Math.round(total * 100) / 100
        })()
      : Promise.resolve(0),
    isProducer && producerUserId
      ? (async () => {
          const weekStart = new Date(now)
          weekStart.setDate(weekStart.getDate() - 7)
          weekStart.setHours(0, 0, 0, 0)
          const producers = await prisma.user.findMany({
            where: { role: 'PRODUCER' },
            select: { id: true },
          })
          const rates: { id: string; rate: number }[] = []
          for (const p of producers) {
            const [a, r] = await Promise.all([
              prisma.productionAccount.count({
                where: {
                  producerId: p.id,
                  status: 'APPROVED',
                  deletedAt: null,
                  createdAt: { gte: weekStart, lte: now },
                },
              }),
              prisma.productionAccount.count({
                where: {
                  producerId: p.id,
                  status: 'REJECTED',
                  deletedAt: null,
                  createdAt: { gte: weekStart, lte: now },
                },
              }),
            ])
            const t = a + r
            if (t < 3) continue
            rates.push({ id: p.id, rate: a / t })
          }
          rates.sort((x, y) => y.rate - x.rate)
          const idx = rates.findIndex((x) => x.id === producerUserId)
          return idx >= 0 ? idx + 1 : null
        })()
      : Promise.resolve(null as number | null),
    isProducer && producerUserId
      ? (async () => {
          const cfg = await getProductionConfig()
          const out: { key: string; label: string; variablePay: number; totalPay: number }[] = []
          for (let back = 1; back <= 2; back++) {
            const ref = new Date(now.getFullYear(), now.getMonth() - back, 15)
            const y = ref.getFullYear()
            const m = ref.getMonth()
            const s = new Date(y, m, 1)
            const e = new Date(y, m + 1, 0, 23, 59, 59, 999)
            const [p, g] = await Promise.all([
              prisma.productionAccount.count({
                where: {
                  producerId: producerUserId!,
                  status: 'APPROVED',
                  deletedAt: null,
                  validatedAt: { not: null, gte: s, lte: e },
                  ...(pf ? { platform: pf as AccountPlatform } : {}),
                },
              }),
              prisma.productionG2.count({
                where: {
                  creatorId: producerUserId!,
                  status: { in: [...G2_DONE] },
                  archivedAt: null,
                  validatedAt: { not: null, gte: s, lte: e },
                },
              }),
            ])
            const { total, baseSalary } = calculateMonthlyAmount(p + g, cfg)
            out.push({
              key: `${y}-${m + 1}`,
              label: ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
              variablePay: Math.round((total - baseSalary) * 100) / 100,
              totalPay: total,
            })
          }
          return out
        })()
      : Promise.resolve([] as { key: string; label: string; variablePay: number; totalPay: number }[]),
  ])

  const productionDaily = productionAccountDaily + g2DailyCount
  const productionMonthly = productionAccountMonthly + g2MonthlyCount

  const incomeMonth = financialMonth.find((x) => x.type === 'INCOME')?._sum.value ?? 0
  const incomeTotal = financialTotal.find((x) => x.type === 'INCOME')?._sum.value ?? 0
  const expenseTotal = financialTotal.find((x) => x.type === 'EXPENSE')?._sum.value ?? 0
  let saldo = Number(incomeTotal) - Number(expenseTotal)
  let bonusAccumulated = Number(bonusReleased._sum.value ?? 0)
  let revenueMonthVal = Number(incomeMonth)

  const validatedMonthTotal = producerValidatedProd + producerValidatedG2
  let previsaoTotalMes = 0
  let variablePayMonth = 0

  if (isProducer && producerPaymentConfig) {
    saldo = producerBalance
    revenueMonthVal = producerRevenueAttributed
    const previsao = calculateMonthlyAmount(validatedMonthTotal, producerPaymentConfig)
    previsaoTotalMes = previsao.total
    variablePayMonth = Math.round((previsao.total - previsao.baseSalary) * 100) / 100
    bonusAccumulated = variablePayMonth
  }
  const ordersSold = Number(ordersSoldResult._sum.quantity ?? 0)
  const ordersDelivered = Number(ordersDeliveredResult._sum.quantity ?? 0)

  let mp = metaProducao ? parseInt(metaProducao.value, 10) : 10000
  if (isProducer && producerPaymentConfig) {
    mp = producerPaymentConfig.metaMensal
  }
  const mv = metaVendas ? parseInt(metaVendas.value, 10) : 10000

  const sold7d = Number(sold7dResult._sum.quantity ?? 0)
  const avgDailySales = sold7d / 7
  const stockRunwayDays =
    avgDailySales > 0.0001 ? Math.round((stockCount / avgDailySales) * 10) / 10 : null

  const allKpis: {
    key: string
    label: string
    value: number
    meta: number
    unit: string
  }[] = [
    { key: 'productionDaily', label: 'Produção Diária', value: productionDaily, meta: 0, unit: 'contas' },
    {
      key: 'productionMonthly',
      label: isProducer ? 'Produção Mensal' : 'Produção Mensal',
      value: productionMonthly,
      meta: mp,
      unit: 'contas',
    },
    {
      key: 'stockCount',
      label: isProducer ? 'Suas contas em estoque' : 'Contas em Estoque',
      value: stockCount,
      meta: 0,
      unit: 'contas',
    },
    {
      key: 'productionRejectedMonth',
      label: 'Produção rejeitada (mês)',
      value: productionRejectedMonth,
      meta: 0,
      unit: 'contas',
    },
    {
      key: 'stockRunwayDays',
      label: 'Autonomia de estoque (méd. 7d)',
      value: stockRunwayDays != null ? stockRunwayDays : 0,
      meta: 0,
      unit: stockRunwayDays != null ? 'dias' : '—',
    },
    {
      key: 'ordersSold',
      label: isProducer ? 'Contas Vendidas (mês)' : 'Contas Vendidas (mês)',
      value: ordersSold,
      meta: mv,
      unit: 'contas',
    },
    {
      key: 'ordersDelivered',
      label: isProducer ? 'Contas Entregues (mês)' : 'Contas Entregues (mês)',
      value: ordersDelivered,
      meta: 0,
      unit: 'contas',
    },
    {
      key: 'revenueMonth',
      label: isProducer ? 'Receita do Mês (suas vendas)' : 'Receita do Mês',
      value: revenueMonthVal,
      meta: 0,
      unit: 'R$',
    },
    {
      key: 'saldo',
      label: isProducer ? 'Saldo disponível (saques)' : 'Saldo Geral',
      value: saldo,
      meta: 0,
      unit: 'R$',
    },
    {
      key: 'bonusAccumulated',
      label: isProducer ? 'Bônus acumulado (variável)' : 'Bônus Acumulado',
      value: bonusAccumulated,
      meta: 0,
      unit: 'R$',
    },
  ]

  const PRODUCER_DASH_KEYS = [
    'productionDaily',
    'productionMonthly',
    'stockCount',
    'ordersSold',
    'ordersDelivered',
    'revenueMonth',
    'saldo',
    'bonusAccumulated',
  ] as const

  const kpis = isProducer
    ? PRODUCER_DASH_KEYS.map((key) => allKpis.find((k) => k.key === key)).filter(
        (x): x is (typeof allKpis)[number] => x != null
      )
    : allKpis

  const lastDayMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const daysUntilMonthEnd = Math.max(
    0,
    Math.round((lastDayMonth.getTime() - today0.getTime()) / 86_400_000)
  )

  let producerInsights: {
    previsaoTotalMes: number
    metaPadraoContas: number
    metaEliteContas: number
    approvalRankWeek: number | null
    nextTierHint: string | null
    bonusHistory: { key: string; label: string; variablePay: number; totalPay: number }[]
    daysUntilMonthEnd: number
    closingHint: string | null
  } | null = null

  if (isProducer && producerPaymentConfig) {
    const nt = nextTierProgress(validatedMonthTotal, producerPaymentConfig)
    const nextTierHint =
      nt && nt.bonusDelta > 0
        ? `Faltam ${nt.accountsToNext} conta(s) aprovada(s) para liberar mais ${nt.bonusDelta.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em bônus por faixa.`
        : null
    producerInsights = {
      previsaoTotalMes,
      metaPadraoContas: producerPaymentConfig.metaMensal,
      metaEliteContas: producerPaymentConfig.metaElite,
      approvalRankWeek: producerApprovalRankWeek,
      nextTierHint,
      bonusHistory: producerBonusHistory,
      daysUntilMonthEnd,
      closingHint:
        daysUntilMonthEnd > 0
          ? `Faltam ${daysUntilMonthEnd} dia(s) até o fim do mês (fechamento). Saldo disponível para saque: ${saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`
          : null,
    }
  }

  return NextResponse.json({
    kpis,
    platformFilter: pf ? String(pf) : 'ALL',
    viewerScope: isProducer ? 'PRODUCER' : 'TEAM',
    /** Para produtor: saldo/previsão são individuais; para o restante, financeiro global. */
    financialAggregatedAllPlatforms: !isProducer,
    pendingWithdrawals,
    stockRunwayDays,
    avgDailySalesLast7d: Math.round(avgDailySales * 100) / 100,
    producerInsights,
  })
}
