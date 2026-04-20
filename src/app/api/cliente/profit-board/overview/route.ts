import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  resolveProfitBoardRange,
  clampDeductionPct,
  decToNumber,
  getMentoradoOfferIds,
  getClientUniIds,
  maybeNotifyProfitBleeding,
  computePeerCreativeRoiBenchmark,
} from '@/lib/cliente/profit-board'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    select: {
      id: true,
      clientCode: true,
      operationNiche: true,
      widgetNiche: true,
    },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const url = new URL(req.url)
  const range = resolveProfitBoardRange(url.searchParams)
  const qpDed = url.searchParams.get('deductionPct')
  const deductionPct =
    qpDed != null && qpDed !== ''
      ? clampDeductionPct(qpDed)
      : clampDeductionPct(process.env.PROFIT_BOARD_DEFAULT_DEDUCTION_PCT ?? '0')

  const minBleed = Math.max(0, Number(process.env.PROFIT_BOARD_BLEEDING_MIN_SPEND ?? '200') || 200)
  const skipBleedingNotify = url.searchParams.get('skipBleedingNotify') === '1'

  const [offerIds, uniIds] = await Promise.all([
    getMentoradoOfferIds(client.id),
    getClientUniIds(client.id),
  ])

  const since24h = new Date(Date.now() - 24 * 3600 * 1000)
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000)

  const [
    revenueAgg,
    spendAgg,
    checkout7d,
    spend7dAgg,
    shieldAllowed,
    shieldBlocked,
    ltvRows,
    campaigns,
    customerMetrics,
  ] = await Promise.all([
    offerIds.length === 0
      ? Promise.resolve({ _sum: { amountGross: null } })
      : prisma.trackerOfferSaleSignal.aggregate({
          where: {
            offerId: { in: offerIds },
            paymentState: 'APPROVED',
            countedForRevenue: true,
            createdAt: { gte: range.from, lte: range.to },
          },
          _sum: { amountGross: true },
        }),
    prisma.creativeAdMetricsEntry.aggregate({
      where: { clientId: client.id, metricDate: { gte: range.from, lte: range.to } },
      _sum: { spend: true, sales: true },
    }),
    offerIds.length === 0
      ? Promise.resolve(0)
      : prisma.trackerCheckoutInitiation.count({
          where: {
            offerId: { in: offerIds },
            outcome: 'REDIRECT_302',
            createdAt: { gte: since7d },
          },
        }),
    prisma.creativeAdMetricsEntry.aggregate({
      where: { clientId: client.id, metricDate: { gte: since7d } },
      _sum: { spend: true },
    }),
    uniIds.length === 0
      ? Promise.resolve(0)
      : prisma.trafficShieldAccessLog.count({
          where: { uniId: { in: uniIds }, createdAt: { gte: since24h }, verdict: 'ALLOWED' },
        }),
    uniIds.length === 0
      ? Promise.resolve(0)
      : prisma.trafficShieldAccessLog.count({
          where: { uniId: { in: uniIds }, createdAt: { gte: since24h }, verdict: 'BLOCKED' },
        }),
    offerIds.length === 0
      ? Promise.resolve([])
      : prisma.trackerLeadLtvAggregate.findMany({
          where: { attributedOfferId: { in: offerIds } },
          orderBy: { totalGross: 'desc' },
          take: 50,
          select: {
            buyerHint: true,
            purchaseCount: true,
            totalGross: true,
            attributedCampaignId: true,
            attributedOfferId: true,
            firstPurchaseAt: true,
            lastPurchaseAt: true,
            currency: true,
          },
        }),
    uniIds.length === 0
      ? Promise.resolve([])
      : prisma.adsTrackerCampaign.findMany({
          where: { uniId: { in: uniIds }, status: 'ACTIVE' },
          orderBy: { clickTotal: 'desc' },
          take: 15,
          select: { id: true, name: true, clickTotal: true, uniId: true, gclidCaptured: true },
        }),
    prisma.customerMetrics.findUnique({
      where: { clientId: client.id },
      select: {
        revenueTotal: true,
        costTotal: true,
        marginTotal: true,
        ltvReal: true,
        referenceDate: true,
      },
    }),
  ])

  const grossRevenue = decToNumber(revenueAgg._sum.amountGross)
  const adSpend = decToNumber(spendAgg._sum.spend)
  const creativeSales = decToNumber(spendAgg._sum.sales)
  const spend7d = decToNumber(spend7dAgg._sum.spend)

  const netRevenue = grossRevenue * (1 - deductionPct / 100)
  const netProfit = netRevenue - adSpend
  const roiRealPercent = adSpend > 0 ? (netProfit / adSpend) * 100 : null

  const creativeSpend = adSpend
  const yourCreativeRoiPercent =
    creativeSpend > 0 ? ((creativeSales - creativeSpend) / creativeSpend) * 100 : null

  const nicheKey = (client.operationNiche || client.widgetNiche || 'GERAL').trim() || 'GERAL'
  const bench = await computePeerCreativeRoiBenchmark({
    nicheKey,
    excludeClientId: client.id,
    from: range.from,
    to: range.to,
  })

  let benchmarkDeltaPercent: number | null = null
  if (bench.peerAvg != null && yourCreativeRoiPercent != null) {
    benchmarkDeltaPercent = yourCreativeRoiPercent - bench.peerAvg
  }

  const shieldTotal = shieldAllowed + shieldBlocked
  const blockedRatio = shieldTotal > 0 ? shieldBlocked / shieldTotal : 0
  let maxScaleIncreasePercent = 20
  if (blockedRatio > 0.15) maxScaleIncreasePercent = 15
  if (blockedRatio > 0.35) maxScaleIncreasePercent = 10

  let scaleMessage = ''
  if (roiRealPercent != null && roiRealPercent >= 50) {
    scaleMessage = `ROI real forte (~${roiRealPercent.toFixed(0)}%). Podes testar aumentos de orçamento até ${maxScaleIncreasePercent}% por dia, em degraus, monitorando a UNI.`
  } else if (roiRealPercent != null && roiRealPercent > 0) {
    scaleMessage =
      'ROI real positivo: aumenta com moderação (máx. recomendado hoje conforme saúde da UNI) e valida criativos antes de escalar agressivamente.'
  } else if (roiRealPercent != null && roiRealPercent <= 0) {
    scaleMessage =
      'Sem ROI real positivo no período selecionado — não escales até o faturamento S2S e o gasto (Creative Vault) convergirem.'
  } else {
    scaleMessage = 'Sem gasto registado no período — importa métricas no Creative Vault para ver ROI real.'
  }

  if (blockedRatio > 0.25) {
    scaleMessage += ` Atenção: muitos bloqueios no shield nas últimas 24h (${(blockedRatio * 100).toFixed(0)}%) — reduz incrementos de budget.`
  }

  const bleeding = spend7d >= minBleed && checkout7d === 0 && offerIds.length > 0

  let bleedingNotify: { inAppSent: boolean; telegramOk: boolean; telegramSkipped: boolean } | null = null
  if (!skipBleedingNotify && bleeding) {
    bleedingNotify = await maybeNotifyProfitBleeding({
      userId: session.user!.id,
      clientId: client.id,
      clientCode: client.clientCode,
      bleeding: true,
      spend7d,
      checkouts7d: checkout7d,
    })
  }

  return NextResponse.json({
    period: { from: range.fromStr, to: range.toStr },
    deductionPercent: deductionPct,
    dataSources: {
      spend: 'CREATIVE_VAULT',
      revenue: 'TRACKER_S2S',
      note:
        'Gasto = soma das métricas que registas no Creative Vault. Receita = vendas aprovadas via postback S2S das ofertas ligadas ao Shield & Tracker.',
    },
    offersLinked: offerIds.length,
    totals: {
      adSpend,
      grossRevenueTracker: grossRevenue,
      netRevenueTracker: netRevenue,
      netProfit,
      roiRealPercent,
      currency: 'BRL',
    },
    creativeVault: {
      spend: creativeSpend,
      salesReported: creativeSales,
      roiPercent: yourCreativeRoiPercent,
    },
    uniHealth24h: {
      allowed: shieldAllowed,
      blocked: shieldBlocked,
      blockedRatio,
      maxRecommendedDailyBudgetIncreasePercent: maxScaleIncreasePercent,
    },
    scalePredictorHint: {
      message: scaleMessage,
      riskFlagBudgetCapPercent: 20,
    },
    ltv: {
      rows: ltvRows.map((r) => ({
        buyerHint: r.buyerHint,
        purchaseCount: r.purchaseCount,
        totalGross: decToNumber(r.totalGross),
        currency: r.currency,
        attributedCampaignId: r.attributedCampaignId,
        attributedOfferId: r.attributedOfferId,
        firstPurchaseAt: r.firstPurchaseAt.toISOString(),
        lastPurchaseAt: r.lastPurchaseAt.toISOString(),
      })),
    },
    campaignsTop: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      clickTotal: c.clickTotal,
      gclidCaptured: c.gclidCaptured,
      uniId: c.uniId,
    })),
    bleeding: {
      active: bleeding,
      windowDays: 7,
      spendCreative7d: spend7d,
      checkoutRedirects302: checkout7d,
      minSpendThreshold: minBleed,
    },
    benchmark: {
      nicheKey,
      peerAvgCreativeRoiPercent: bench.peerAvg,
      yourCreativeRoiPercent,
      sampleSize: bench.sampleSize,
      deltaVsPeerPercent: benchmarkDeltaPercent,
      disclaimer:
        'Benchmark anónimo: compara o teu ROI do Creative Vault (vendas registadas vs. gasto) com a média de outros mentorados no mesmo nicho operacional. A linha de lucro principal usa receita real do tracker S2S.',
    },
    biSnapshot: customerMetrics
      ? {
          referenceDate: customerMetrics.referenceDate.toISOString(),
          revenueTotal: decToNumber(customerMetrics.revenueTotal),
          costTotal: decToNumber(customerMetrics.costTotal),
          marginTotal: decToNumber(customerMetrics.marginTotal),
          ltvReal: decToNumber(customerMetrics.ltvReal),
        }
      : null,
    bleedingNotify,
  })
}
