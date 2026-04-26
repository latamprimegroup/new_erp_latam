/**
 * GET /api/admin/tesouraria
 *
 * Dashboard de Tesouraria Multimoeda — Unified Liquidity Header
 *
 * Retorna em tempo real:
 *   1. Liquidez total convertida (BRL + USD→BRL + USDT→BRL)
 *   2. Saldo por canal: Inter PIX (BRL), Mercury (USD), USDT
 *   3. Faturamento do período por gateway
 *   4. Taxa FX USD/BRL atualizada (cache 30min)
 *   5. Spread e custo estimado de remessa
 *   6. Run rate anual projetado com base nos últimos 30 dias
 *   7. Alerta de estoque crítico
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getFxRates, getMercuryBalance, getMercuryTransactions } from '@/lib/mercury/client'
import { subDays, startOfDay, format } from 'date-fns'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['ADMIN', 'CEO']

// Taxa estimada de spread para remessa USD→BRL (Wise/Remessa) e USDT→BRL
const WIRE_SPREAD_PCT    = 2.5   // custo aproximado de wire USD→BRL
const USDT_SPREAD_PCT    = 1.5   // custo aproximado de USDT→BRL (exchange)
const STOCK_ALERT_RATIO  = 0.20  // alerta quando disponível < 20% do volume médio/dia

function isAllowed(role?: string) {
  return ALLOWED_ROLES.includes(role ?? '')
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!isAllowed(role)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const days = Math.min(90, Math.max(7, Number.parseInt(searchParams.get('days') ?? '30', 10)))
  const since = subDays(new Date(), days)

  // ── 1. FX em tempo real ────────────────────────────────────────────────────
  let fxRates: { usdToBrl: number; updatedAt: string } = { usdToBrl: 5.2, updatedAt: 'fallback' }
  try {
    const fx = await getFxRates()
    fxRates = {
      usdToBrl:  Number((fx.rates['BRL'] ?? 5.2).toFixed(4)),
      updatedAt: fx.updatedAt,
    }
  } catch { /* fallback mantido */ }

  const usdToBrl = fxRates.usdToBrl

  // ── 2. Mercury — Saldo USD ─────────────────────────────────────────────────
  let mercuryBalance: { totalAvailableUsd: number; totalCurrentUsd: number } = { totalAvailableUsd: 0, totalCurrentUsd: 0 }
  let mercuryConnected = false
  let mercuryError: string | null = null
  try {
    mercuryBalance  = await getMercuryBalance()
    mercuryConnected = true
  } catch (e) {
    mercuryError = e instanceof Error ? e.message.slice(0, 120) : 'Mercury offline'
  }

  // ── 3. Mercury — Transações do período (créditos) ─────────────────────────
  let mercuryPeriodUsd = 0
  let mercuryTxCount   = 0
  let mercuryRecentTxs: Array<{
    id: string; amount: number; createdAt: string;
    counterpartyName: string | null; kind: string; note: string | null
  }> = []
  try {
    const accountId = process.env.MERCURY_ACCOUNT_ID
    if (accountId && mercuryConnected) {
      const txs = await getMercuryTransactions(accountId, {
        limit: 100,
        start: since.toISOString().split('T')[0],
      })
      const credits = txs.filter((t) => t.amount > 0 && t.status === 'sent')
      mercuryPeriodUsd = credits.reduce((s, t) => s + t.amount, 0)
      mercuryTxCount   = credits.length
      mercuryRecentTxs = credits.slice(0, 10).map((t) => ({
        id:              t.id,
        amount:          t.amount,
        createdAt:       t.createdAt,
        counterpartyName: t.counterpartyName,
        kind:            t.kind,
        note:            t.note,
      }))
    }
  } catch { /* Mercury período silencioso */ }

  // ── 4. Inter — Faturamento PIX BRL do período ─────────────────────────────
  const pixCheckouts = await prisma.quickSaleCheckout.aggregate({
    where: {
      status: 'PAID',
      paidAt: { gte: since },
    },
    _sum:   { totalAmount: true },
    _count: { id: true },
  })
  const pixBrl      = Number(pixCheckouts._sum.totalAmount ?? 0)
  const pixTxCount  = pixCheckouts._count.id

  // Busca também Sales Checkouts PIX (fluxo legado)
  const salesPixCheckouts = await prisma.salesCheckout.aggregate({
    where: {
      status: 'PAID',
      paidAt: { gte: since },
    },
    _sum: { amount: true },
    _count: { id: true },
  }).catch(() => ({ _sum: { amount: 0 }, _count: { id: 0 } }))
  const salesPixBrl   = Number(salesPixCheckouts._sum.amount ?? 0)
  const salesPixCount = salesPixCheckouts._count.id

  const totalInterBrl = pixBrl + salesPixBrl
  const totalInterTxs = pixTxCount + salesPixCount

  // ── 5. Kast (USDT/cripto) — via tabela Transaction ────────────────────────
  const kastTxs = await prisma.transaction.findMany({
    where: {
      gateway:    { in: ['KAST'] },
      status:     'APPROVED',
      occurredAt: { gte: since },
    },
    select: {
      grossAmount:  true,
      currency:     true,
      fxRateBrlUsd: true,
    },
  }).catch(() => [] as never[])

  let kastBrl   = 0
  let kastUsd   = 0
  for (const t of kastTxs) {
    const gross = Number(t.grossAmount)
    if (t.currency === 'USD') {
      kastUsd += gross
      kastBrl += gross * (Number(t.fxRateBrlUsd ?? usdToBrl))
    } else {
      kastBrl += gross
    }
  }

  // ── 6. Spread e Lucro Líquido Real ────────────────────────────────────────
  const mercuryBrl        = mercuryPeriodUsd * usdToBrl
  const mercurySpreadCost = mercuryBrl * (WIRE_SPREAD_PCT / 100)
  const kastSpreadCost    = kastBrl * (USDT_SPREAD_PCT / 100)
  const totalSpreadCost   = mercurySpreadCost + kastSpreadCost

  const totalGrossBrl  = totalInterBrl + mercuryBrl + kastBrl
  const totalNetBrl    = totalGrossBrl - totalSpreadCost

  // Liquidez atual (saldo vivo convertido)
  const mercuryAvailableBrl = mercuryBalance.totalAvailableUsd * usdToBrl
  const totalLiquidityBrl   = mercuryAvailableBrl  // Inter não expõe saldo via API

  // ── 7. Run Rate Anualizado ─────────────────────────────────────────────────
  const dailyAvgBrl = totalGrossBrl / days
  const annualRunRate = dailyAvgBrl * 365
  const metaAnual     = 10_000_000
  const progressPct   = Math.min(100, Math.round((annualRunRate / metaAnual) * 100))

  // ── 8. Alerta de Estoque Crítico ──────────────────────────────────────────
  const dailyAvgUnits = (pixTxCount + salesPixCount) / days
  const currentStock  = await prisma.asset.count({ where: { status: 'AVAILABLE' } }).catch(() => 0)
  const daysOfStock   = dailyAvgUnits > 0 ? currentStock / dailyAvgUnits : 999
  const stockAlert    = daysOfStock < 3  // menos de 3 dias de estoque

  // ── 9. Ultimos eventos PIX Inter ──────────────────────────────────────────
  const recentPixEvents = await prisma.interPixLog.findMany({
    orderBy: { processedAt: 'desc' },
    take:    10,
    select: {
      id: true, txid: true, amount: true, status: true,
      flowType: true, processedAt: true, errorMsg: true,
    },
  }).catch(() => [] as never[])

  // ── 10. UTM de origem — atribuição de tráfego ─────────────────────────────
  const utmBreakdown = await prisma.quickSaleCheckout.groupBy({
    by:    ['utmSource'],
    where: {
      status: 'PAID',
      paidAt: { gte: since },
    },
    _count: { id: true },
    _sum:   { totalAmount: true },
    orderBy: { _sum: { totalAmount: 'desc' } },
    take: 8,
  }).catch(() => [] as never[])

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    period: { days, since: since.toISOString() },
    fx: fxRates,

    // Painel de Liquidez
    liquidity: {
      totalLiquidityBrl:    Math.round(totalLiquidityBrl),
      mercuryAvailableBrl:  Math.round(mercuryAvailableBrl),
      mercuryAvailableUsd:  mercuryBalance.totalAvailableUsd,
      mercuryCurrentUsd:    mercuryBalance.totalCurrentUsd,
    },

    // Faturamento do período
    revenue: {
      totalGrossBrl:   Math.round(totalGrossBrl * 100) / 100,
      totalNetBrl:     Math.round(totalNetBrl * 100) / 100,
      totalSpreadCost: Math.round(totalSpreadCost * 100) / 100,
      spreadCostPct:   totalGrossBrl > 0 ? Math.round((totalSpreadCost / totalGrossBrl) * 10000) / 100 : 0,
      byGateway: [
        {
          gateway:    'INTER',
          label:      '🏦 Brasil (PIX Inter)',
          currency:   'BRL',
          amountBrl:  Math.round(totalInterBrl * 100) / 100,
          amountNative: Math.round(totalInterBrl * 100) / 100,
          txCount:    totalInterTxs,
          spreadPct:  0,
          connected:  true,
        },
        {
          gateway:    'MERCURY',
          label:      '🇺🇸 EUA (Mercury USD)',
          currency:   'USD',
          amountBrl:  Math.round(mercuryBrl * 100) / 100,
          amountNative: Math.round(mercuryPeriodUsd * 100) / 100,
          txCount:    mercuryTxCount,
          spreadPct:  WIRE_SPREAD_PCT,
          connected:  mercuryConnected,
          error:      mercuryError,
        },
        {
          gateway:    'KAST',
          label:      '₿ Global (USDT/Cripto)',
          currency:   'USD',
          amountBrl:  Math.round(kastBrl * 100) / 100,
          amountNative: Math.round(kastUsd * 100) / 100,
          txCount:    kastTxs.length,
          spreadPct:  USDT_SPREAD_PCT,
          connected:  true,
        },
      ],
    },

    // Projeção
    projection: {
      dailyAvgBrl:    Math.round(dailyAvgBrl * 100) / 100,
      annualRunRate:  Math.round(annualRunRate),
      metaAnual,
      progressPct,
      daysToMeta:     dailyAvgBrl > 0 ? Math.ceil(metaAnual / dailyAvgBrl) : null,
    },

    // Estoque
    stock: {
      currentAvailable: currentStock,
      dailyAvgUnits:    Math.round(dailyAvgUnits * 10) / 10,
      daysOfStock:      Math.round(daysOfStock * 10) / 10,
      alert:            stockAlert,
    },

    // Eventos recentes
    recentPixEvents,
    mercuryRecentTxs,

    // Atribuição de tráfego
    utmBreakdown: utmBreakdown.map((u) => ({
      source:   u.utmSource ?? '(direto)',
      count:    u._count.id,
      revenueBrl: Math.round(Number(u._sum.totalAmount ?? 0) * 100) / 100,
    })),
  })
}
