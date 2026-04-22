/**
 * GET /api/rma/dre
 * Impacto das trocas/reposições no DRE:
 *   - "Custo de Garantia" por período
 *   - Créditos com fornecedores (o que nos devem)
 *   - Linha DRE: Lucro Líquido Real (descontando custo de garantia)
 */
import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'

export async function GET(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['ADMIN', 'FINANCE', 'PURCHASING'].includes(session.user.role ?? ''))
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const year  = parseInt(searchParams.get('year')  ?? String(new Date().getFullYear()), 10)
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1), 10)

  const mStart = new Date(year, month - 1, 1)
  const mEnd   = new Date(year, month,     1)

  // Custo de garantia do mês
  const monthRMA = await prisma.rMATicket.findMany({
    where:   { openedAt: { gte: mStart, lt: mEnd }, status: { notIn: ['REJECTED'] } },
    select: {
      id: true, status: true, isVendorFault: true,
      replacementCost: true, vendorCreditAmount: true,
      reason: true, vendor: { select: { name: true } },
    },
  })

  const warrantyCost   = monthRMA.reduce((s, r) => s + Number(r.replacementCost ?? 0), 0)
  const vendorCredits  = monthRMA.filter((r) => r.isVendorFault).reduce((s, r) => s + Number(r.vendorCreditAmount ?? 0), 0)
  const netCost        = warrantyCost - vendorCredits // Custo real (descontando o que o vendor vai repor)

  // Faturamento do mês (para calcular DRE)
  const [revAgg, vendorBreakdown] = await Promise.all([
    prisma.assetSalesOrder.aggregate({
      where:  { status: { in: ['DELIVERED', 'DELIVERING'] }, deliveredAt: { gte: mStart, lt: mEnd } },
      _sum:   { negotiatedPrice: true, grossMargin: true, costSnapshot: true },
    }),
    // Custo de garantia por fornecedor no mês
    prisma.rMATicket.groupBy({
      by:    ['vendorId'],
      where: { openedAt: { gte: mStart, lt: mEnd }, status: { notIn: ['REJECTED'] }, isVendorFault: true },
      _sum:  { replacementCost: true, vendorCreditAmount: true },
      _count: true,
    }),
  ])

  const revenue     = Number(revAgg._sum.negotiatedPrice ?? 0)
  const grossMargin = Number(revAgg._sum.grossMargin     ?? 0)
  const netMargin   = grossMargin - netCost // Lucro real após custo de garantia

  // Busca nomes dos vendors para o breakdown
  const vendorIds   = vendorBreakdown.map((v) => v.vendorId)
  const vendorNames = vendorIds.length > 0
    ? await prisma.vendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true } })
    : []
  const nameMap = Object.fromEntries(vendorNames.map((v) => [v.id, v.name]))

  // Totais acumulados (all-time)
  const allTimeRMA = await prisma.rMATicket.aggregate({
    where:  { status: { notIn: ['REJECTED'] } },
    _sum:   { replacementCost: true, vendorCreditAmount: true },
    _count: true,
  })

  // Créditos pendentes totais (o que os fornecedores nos devem)
  const pendingCreditsAll = await prisma.rMATicket.aggregate({
    where: { isVendorFault: true, status: { notIn: ['CREDITED', 'REJECTED'] } },
    _sum:  { vendorCreditAmount: true },
    _count: true,
  })

  // Histórico mensal (últimos 6 meses) para o sparkline
  const history = []
  for (let i = 5; i >= 0; i--) {
    const d    = new Date(year, month - 1 - i, 1)
    const dEnd = new Date(year, month     - i, 1)
    const agg  = await prisma.rMATicket.aggregate({
      where: { openedAt: { gte: d, lt: dEnd }, status: { notIn: ['REJECTED'] } },
      _sum:  { replacementCost: true, vendorCreditAmount: true },
      _count: true,
    })
    history.push({
      month:         d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }),
      warrantyCost:  Number(agg._sum.replacementCost    ?? 0),
      vendorCredits: Number(agg._sum.vendorCreditAmount ?? 0),
      count:         agg._count,
    })
  }

  return NextResponse.json({
    period: { year, month },
    dre: {
      revenue,
      grossMargin,
      warrantyCost,
      vendorCredits,
      netCost,
      netMargin,
      marginAfterRMA: revenue > 0 ? ((netMargin / revenue) * 100) : 0,
    },
    allTime: {
      totalRMA:           allTimeRMA._count,
      totalWarrantyCost:  Number(allTimeRMA._sum.replacementCost    ?? 0),
      totalVendorCredits: Number(allTimeRMA._sum.vendorCreditAmount ?? 0),
    },
    pendingCredits: {
      amount: Number(pendingCreditsAll._sum.vendorCreditAmount ?? 0),
      count:  pendingCreditsAll._count,
    },
    vendorBreakdown: vendorBreakdown.map((v) => ({
      vendorId:      v.vendorId,
      vendorName:    nameMap[v.vendorId] ?? v.vendorId,
      rmaCount:      v._count,
      warrantyCost:  Number(v._sum.replacementCost    ?? 0),
      vendorCredits: Number(v._sum.vendorCreditAmount ?? 0),
    })).sort((a, b) => b.warrantyCost - a.warrantyCost),
    history,
  })
}
