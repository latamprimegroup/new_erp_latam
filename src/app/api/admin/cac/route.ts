/**
 * Termômetro de CAC (Custo de Aquisição por Cliente)
 *
 * CAC = Σ despesas de marketing no período / Nº de vendas PAID no período
 *
 * Alerta: se CAC > threshold (configurável, default R$ 200), retorna alerta.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED = ['ADMIN', 'FINANCE']

/** Threshold padrão em BRL — acima disto gera alerta vermelho */
const CAC_ALERT_THRESHOLD = 200

/** Categorias de despesa que entram no custo de marketing */
const MARKETING_CATEGORIES = [
  'TRAFEGO_PAGO',
  'MARKETING',
  'ADS_SPEND',
  'MIDIA_PAGA',
  'INFRA',
  'OPERACIONAL',
]

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const months = parseInt(searchParams.get('months') ?? '1', 10)
  const threshold = parseFloat(searchParams.get('threshold') ?? String(CAC_ALERT_THRESHOLD))

  // Período: últimos N meses
  const since = new Date()
  since.setMonth(since.getMonth() - months)
  since.setDate(1)
  since.setHours(0, 0, 0, 0)

  const [marketingExpenses, salesCount, totalRevenue, commissions] = await Promise.all([
    // Soma das despesas de marketing no período
    prisma.financialEntry.aggregate({
      where: {
        type:     'EXPENSE',
        date:     { gte: since },
        category: { in: MARKETING_CATEGORIES },
      },
      _sum: { value: true },
    }),

    // Nº de pedidos PAID no período
    prisma.order.count({
      where: {
        status: { in: ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] },
        paidAt: { gte: since },
      },
    }),

    // Receita total no período
    prisma.order.aggregate({
      where: {
        status: { in: ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] },
        paidAt: { gte: since },
      },
      _sum: { value: true },
    }),

    // Comissões provisionadas no período
    prisma.financialEntry.aggregate({
      where: {
        type:     'EXPENSE',
        category: 'COMISSOES_VENDEDORES',
        date:     { gte: since },
      },
      _sum: { value: true },
    }),
  ])

  const totalMarketing = Number(marketingExpenses._sum.value ?? 0)
  const totalCommission = Number(commissions._sum.value ?? 0)
  const totalCost = totalMarketing + totalCommission
  const revenue   = Number(totalRevenue._sum.value ?? 0)

  const cac         = salesCount > 0 ? parseFloat((totalCost / salesCount).toFixed(2)) : 0
  const ltv         = salesCount > 0 ? parseFloat((revenue / salesCount).toFixed(2)) : 0
  const ltvCacRatio = cac > 0 ? parseFloat((ltv / cac).toFixed(2)) : null
  const margin      = revenue > 0 ? parseFloat(((revenue - totalCost) / revenue * 100).toFixed(1)) : 0

  const alert = cac > threshold
    ? { level: 'RED', message: `CAC R$ ${cac.toFixed(2)} acima do limite (R$ ${threshold.toFixed(2)})` }
    : cac > threshold * 0.7
    ? { level: 'YELLOW', message: `CAC R$ ${cac.toFixed(2)} próximo do limite` }
    : { level: 'GREEN', message: `CAC saudável (R$ ${cac.toFixed(2)})` }

  // Série histórica: CAC mês a mês (últimos 6 meses)
  const series: { month: string; cac: number; sales: number; marketing: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const mStart = new Date()
    mStart.setMonth(mStart.getMonth() - i)
    mStart.setDate(1); mStart.setHours(0, 0, 0, 0)
    const mEnd = new Date(mStart)
    mEnd.setMonth(mEnd.getMonth() + 1)

    const [mExp, mSales] = await Promise.all([
      prisma.financialEntry.aggregate({
        where: { type: 'EXPENSE', date: { gte: mStart, lt: mEnd }, category: { in: MARKETING_CATEGORIES } },
        _sum: { value: true },
      }),
      prisma.order.count({
        where: { status: { in: ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] }, paidAt: { gte: mStart, lt: mEnd } },
      }),
    ])

    const mMarketing = Number(mExp._sum.value ?? 0)
    series.push({
      month:     mStart.toISOString().slice(0, 7),
      cac:       mSales > 0 ? parseFloat((mMarketing / mSales).toFixed(2)) : 0,
      sales:     mSales,
      marketing: mMarketing,
    })
  }

  return NextResponse.json({
    period:         { months, since },
    cac,
    ltv,
    ltvCacRatio,
    margin,
    totalMarketing,
    totalCommission,
    totalCost,
    revenue,
    salesCount,
    threshold,
    alert,
    series,
  })
}
