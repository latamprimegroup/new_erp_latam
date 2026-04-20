import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calcularMetasMensais } from '@/lib/metas-globais'

const PAID_REVENUE = ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] as const

async function getSettingNumber(key: string, fallback: number): Promise<number> {
  const s = await prisma.systemSetting.findUnique({ where: { key } })
  if (!s) return fallback
  const n = parseFloat(s.value)
  return Number.isFinite(n) ? n : fallback
}

const PLATFORM_LABELS: Record<string, string> = {
  GOOGLE_ADS: 'Google',
  META_ADS: 'Meta',
  KWAI_ADS: 'Kwai',
  TIKTOK_ADS: 'TikTok',
  OTHER: 'Outro',
}

/** KPIs, conversão, estoque por plataforma/tipo, upsell — ADMIN / COMERCIAL. */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const now = new Date()
  const day24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const startOfCalendarDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  const diasNoMes = endOfMonth.getDate()
  const diaAtual = now.getDate()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const GATE_PENDING = ['AWAITING_PAYMENT', 'PENDING', 'APPROVED'] as const

  const [
    agg24h,
    paidCount24h,
    aggCalendarDay,
    paidCountCalendarDay,
    aggMonth,
    paidCountMonth,
    churnClients,
    metas,
    inventoryByType,
    inventoryByPlatformType,
    salesWeekCount,
    metaFaturamentoMes,
    upsellStockMin,
    upsellSalesMax,
    upsellPct,
    ordersCreated30d,
    ordersPaid30d,
    leads30d,
    leadsConverted30d,
    pedidosPendentes,
    ticketPorAccountType,
    sellerTotals,
    tintimWebhookHits30d,
    tintimSales30d,
    tintimTintimLeadEvents30d,
  ] = await Promise.all([
    prisma.order.aggregate({
      where: {
        status: { in: [...PAID_REVENUE] },
        paidAt: { gte: day24h, lte: now },
      },
      _sum: { value: true },
    }),
    prisma.order.count({
      where: {
        status: { in: [...PAID_REVENUE] },
        paidAt: { gte: day24h, lte: now },
      },
    }),
    prisma.order.aggregate({
      where: {
        status: { in: [...PAID_REVENUE] },
        paidAt: { gte: startOfCalendarDay, lte: now },
      },
      _sum: { value: true },
    }),
    prisma.order.count({
      where: {
        status: { in: [...PAID_REVENUE] },
        paidAt: { gte: startOfCalendarDay, lte: now },
      },
    }),
    prisma.order.aggregate({
      where: {
        status: { in: [...PAID_REVENUE] },
        paidAt: { gte: startOfMonth, lte: endOfMonth },
      },
      _sum: { value: true },
    }),
    prisma.order.count({
      where: {
        status: { in: [...PAID_REVENUE] },
        paidAt: { gte: startOfMonth, lte: endOfMonth },
      },
    }),
    prisma.clientProfile.count({
      where: {
        lastPurchaseAt: { lt: thirtyDaysAgo },
        totalSpent: { gt: 0 },
      },
    }),
    calcularMetasMensais(),
    prisma.stockAccount.groupBy({
      by: ['type'],
      where: { deletedAt: null, archivedAt: null, status: 'AVAILABLE' },
      _count: { id: true },
    }),
    prisma.stockAccount.groupBy({
      by: ['platform', 'type'],
      where: { deletedAt: null, archivedAt: null, status: 'AVAILABLE' },
      _count: { id: true },
    }),
    prisma.order.count({
      where: {
        status: { in: [...PAID_REVENUE] },
        paidAt: { gte: weekAgo },
      },
    }),
    getSettingNumber('commercial_meta_faturamento_mensal', 250_000),
    getSettingNumber('commercial_upsell_stock_min', 100),
    getSettingNumber('commercial_upsell_sales_week_max', 10),
    getSettingNumber('commercial_upsell_discount_suggest', 15),
    prisma.order.count({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        status: { notIn: ['CANCELLED', 'QUOTE'] },
      },
    }),
    prisma.order.count({
      where: {
        paidAt: { gte: thirtyDaysAgo },
        status: { in: [...PAID_REVENUE] },
      },
    }),
    prisma.commercialLead.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.commercialLead.count({
      where: { createdAt: { gte: thirtyDaysAgo }, convertedClientId: { not: null } },
    }),
    prisma.order.count({
      where: { status: { in: [...GATE_PENDING] } },
    }),
    prisma.order.groupBy({
      by: ['accountType'],
      where: {
        status: { in: [...PAID_REVENUE] },
        paidAt: { gte: startOfMonth, lte: endOfMonth },
      },
      _sum: { value: true },
      _count: { id: true },
    }),
    prisma.order.groupBy({
      by: ['sellerId'],
      where: {
        status: { in: [...PAID_REVENUE] },
        paidAt: { gte: startOfMonth, lte: endOfMonth },
        sellerId: { not: null },
      },
      _sum: { value: true },
      _count: { id: true },
    }),
    prisma.integrationWebhookLog.count({
      where: { provider: 'TINTIM', createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.order.count({
      where: { orderSource: 'TINTIM', paidAt: { gte: thirtyDaysAgo } },
    }),
    prisma.tintimLeadEvent.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
  ])

  const tintimOrdersForFollowUp = await prisma.order.findMany({
    where: {
      orderSource: 'TINTIM',
      paidAt: { not: null },
      createdAt: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) },
    },
    include: {
      client: { include: { user: { select: { lastLoginAt: true, email: true, name: true } } } },
    },
    orderBy: { paidAt: 'desc' },
    take: 50,
  })

  const tintimFollowUpLeads = tintimOrdersForFollowUp
    .filter((o) => {
      const paid = o.paidAt!.getTime()
      if (now.getTime() < paid + 24 * 60 * 60 * 1000) return false
      const login = o.client.user.lastLoginAt?.getTime() ?? 0
      if (o.client.user.lastLoginAt && login >= paid) return false
      return true
    })
    .map((o) => ({
      orderId: o.id,
      product: o.product,
      paidAt: o.paidAt!.toISOString(),
      clientEmail: o.client.user.email,
      clientName: o.client.user.name,
    }))

  const tintimConversionReal =
    tintimTintimLeadEvents30d > 0
      ? Math.round((tintimSales30d / tintimTintimLeadEvents30d) * 1000) / 10
      : null

  const faturamento24h = Number(agg24h._sum.value ?? 0)
  const ticketMedio24h = paidCount24h > 0 ? faturamento24h / paidCount24h : 0
  const faturamentoDiaCalendario = Number(aggCalendarDay._sum.value ?? 0)
  const ticketMedioDiaCalendario =
    paidCountCalendarDay > 0 ? faturamentoDiaCalendario / paidCountCalendarDay : 0
  const faturamentoMes = Number(aggMonth._sum.value ?? 0)
  const ticketMedioMes = paidCountMonth > 0 ? faturamentoMes / paidCountMonth : 0
  const progressMetaFaturamento =
    metaFaturamentoMes > 0 ? Math.min(100, Math.round((faturamentoMes / metaFaturamentoMes) * 100)) : 0

  const ritmoDiarioMes = diaAtual > 0 ? faturamentoMes / diaAtual : 0
  const forecastFimMes = Math.round(ritmoDiarioMes * diasNoMes)

  const ticketMedioPorLinha = ticketPorAccountType
    .map((r) => {
      const cnt = r._count.id
      const sum = Number(r._sum.value ?? 0)
      return {
        accountType: r.accountType,
        pedidos: cnt,
        faturamento: sum,
        ticketMedio: cnt > 0 ? sum / cnt : 0,
      }
    })
    .sort((a, b) => b.ticketMedio - a.ticketMedio)

  const sellerIds = sellerTotals.map((s) => s.sellerId).filter(Boolean) as string[]
  const sellersNamed = await prisma.user.findMany({
    where: { id: { in: sellerIds } },
    select: { id: true, name: true, email: true },
  })
  const nameById = Object.fromEntries(sellersNamed.map((u) => [u.id, u.name || u.email]))
  const performanceVendedoresMes = sellerTotals
    .map((s) => ({
      sellerId: s.sellerId,
      nome: s.sellerId ? nameById[s.sellerId] || '—' : '—',
      faturamento: Number(s._sum.value ?? 0),
      pedidos: s._count.id,
    }))
    .sort((a, b) => b.faturamento - a.faturamento)
    .slice(0, 12)

  const taxaConversaoPedido30d =
    ordersCreated30d > 0 ? Math.round((ordersPaid30d / ordersCreated30d) * 1000) / 10 : 0
  const taxaConversaoLeads30d =
    leads30d > 0 ? Math.round((leadsConverted30d / leads30d) * 1000) / 10 : null

  const inventoryTotal = inventoryByType.reduce((s, r) => s + r._count.id, 0)
  const stockBrlCount =
    inventoryByType.find((r) => r.type?.toUpperCase() === 'BRL')?._count.id ?? 0
  const stockUsdCount =
    inventoryByType.find((r) => r.type?.toUpperCase() === 'USD')?._count.id ?? 0

  const upsellAlerts: string[] = []
  if (stockBrlCount >= upsellStockMin && salesWeekCount < upsellSalesMax) {
    upsellAlerts.push(
      `BRL: estoque alto (${stockBrlCount} disponíveis) e poucas vendas na semana (${salesWeekCount}). Sugestão: ofereça ${upsellPct}% OFF para queima hoje.`
    )
  }
  if (stockUsdCount >= upsellStockMin && salesWeekCount < upsellSalesMax) {
    upsellAlerts.push(
      `USD: estoque alto (${stockUsdCount} disponíveis) e poucas vendas na semana (${salesWeekCount}). Sugestão: ofereça ${upsellPct}% OFF em contas USD.`
    )
  }

  const inventoryReady = inventoryByPlatformType.map((r) => ({
    platform: PLATFORM_LABELS[r.platform] || r.platform,
    platformCode: r.platform,
    type: r.type,
    count: r._count.id,
    label: `${PLATFORM_LABELS[r.platform] || r.platform} ${r.type}: ${r._count.id}`,
  }))

  return NextResponse.json({
    faturamento24h,
    pedidosPagos24h: paidCount24h,
    faturamentoDiaCalendario,
    pedidosPagosDiaCalendario: paidCountCalendarDay,
    ticketMedioDiaCalendario,
    ticketMedio24h,
    ticketMedioMes,
    faturamentoMes,
    pedidosPagosMes: paidCountMonth,
    pedidosPendentes,
    churnClientes30d: churnClients,
    taxaConversaoPedido30d,
    taxaConversaoLeads30d,
    leadsFunil30d: leads30d,
    leadsConvertidos30d: leadsConverted30d,
    pedidosIniciados30d: ordersCreated30d,
    pedidosPagos30d: ordersPaid30d,
    forecastFimMes,
    diasNoMes,
    diaAtual,
    ticketMedioPorLinha,
    performanceVendedoresMes,
    metaFaturamentoMensal: metaFaturamentoMes,
    progressMetaFaturamentoPct: progressMetaFaturamento,
    metasGlobaisVendasUnidades: {
      meta: metas.metaVendas,
      atual: metas.vendasAtual,
      percentual: Math.round(metas.percentualVendas * 10) / 10,
    },
    inventory: {
      totalAvailable: inventoryTotal,
      byType: inventoryByType.map((r) => ({ type: r.type, count: r._count.id })),
      byPlatformType: inventoryReady,
    },
    vendasPagasUltimos7Dias: salesWeekCount,
    upsellAlerts,
    tintimTintim: {
      webhookHits30d: tintimWebhookHits30d,
      leadEvents30d: tintimTintimLeadEvents30d,
      salesPaid30d: tintimSales30d,
      conversionLeadToSalePct: tintimConversionReal,
      followUpPendente: tintimFollowUpLeads,
    },
  })
}
