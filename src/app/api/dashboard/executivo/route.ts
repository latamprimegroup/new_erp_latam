import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role === 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const ordersSoldQuery = prisma.order.aggregate({
    where: { status: { in: ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] }, paidAt: { gte: startOfMonth, lte: endOfMonth } },
    _sum: { quantity: true },
  })
  const ordersDeliveredQuery = prisma.order.aggregate({
    where: { status: 'DELIVERED', paidAt: { gte: startOfMonth, lte: endOfMonth } },
    _sum: { quantity: true },
  })

  const [
    productionDaily,
    productionMonthly,
    stockCount,
    ordersSoldResult,
    ordersDeliveredResult,
    financialMonth,
    financialTotal,
    bonusReleased,
    metaProducao,
    metaVendas,
  ] = await Promise.all([
    prisma.productionAccount.count({ where: { createdAt: { gte: startOfDay }, status: 'APPROVED' } }),
    prisma.productionAccount.count({ where: { createdAt: { gte: startOfMonth }, status: 'APPROVED' } }),
    prisma.stockAccount.count({ where: { status: 'AVAILABLE' } }),
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
  ])

  const incomeMonth = financialMonth.find((x) => x.type === 'INCOME')?._sum.value ?? 0
  const expenseMonth = financialMonth.find((x) => x.type === 'EXPENSE')?._sum.value ?? 0
  const incomeTotal = financialTotal.find((x) => x.type === 'INCOME')?._sum.value ?? 0
  const expenseTotal = financialTotal.find((x) => x.type === 'EXPENSE')?._sum.value ?? 0
  const saldo = Number(incomeTotal) - Number(expenseTotal)
  const bonusAccumulated = Number(bonusReleased._sum.value ?? 0)
  const ordersSold = Number(ordersSoldResult._sum.quantity ?? 0)
  const ordersDelivered = Number(ordersDeliveredResult._sum.quantity ?? 0)

  const mp = metaProducao ? parseInt(metaProducao.value, 10) : 10000
  const mv = metaVendas ? parseInt(metaVendas.value, 10) : 10000

  return NextResponse.json({
    kpis: [
      { key: 'productionDaily', label: 'Produção Diária', value: productionDaily, meta: 0, unit: 'contas' },
      { key: 'productionMonthly', label: 'Produção Mensal', value: productionMonthly, meta: mp, unit: 'contas' },
      { key: 'stockCount', label: 'Contas em Estoque', value: stockCount, meta: 0, unit: 'contas' },
      { key: 'ordersSold', label: 'Contas Vendidas (mês)', value: ordersSold, meta: mv, unit: 'contas' },
      { key: 'ordersDelivered', label: 'Contas Entregues (mês)', value: ordersDelivered, meta: 0, unit: 'contas' },
      { key: 'revenueMonth', label: 'Receita do Mês', value: Number(incomeMonth), meta: 0, unit: 'R$' },
      { key: 'saldo', label: 'Saldo Geral', value: saldo, meta: 0, unit: 'R$' },
      { key: 'bonusAccumulated', label: 'Bônus Acumulado', value: bonusAccumulated, meta: 0, unit: 'R$' },
    ],
  })
}
