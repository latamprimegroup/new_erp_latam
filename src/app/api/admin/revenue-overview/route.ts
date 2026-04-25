/**
 * GET /api/admin/revenue-overview
 *
 * Visão CEO de 8 Dígitos — Breakdown de faturamento por:
 *  · Tipo de receita (transacional / recorrência / mentoria / spend_fee)
 *  · Perfil de cliente (TRADER, MENTORADO, INFRA_PARTNER, etc.)
 *  · Gateway (Inter / Kast / Mercury / Stripe)
 *  · Moeda (BRL / USD)
 *
 * Combina dados de:
 *  1. `Transaction` (nova tabela unificada)
 *  2. `QuickSaleCheckout` (checkout loja pública — fallback se Transaction vazia)
 *  3. `Subscription` (ARR / MRR de recorrência)
 *
 * Query param: ?period=30d | 90d | 12m | ytd (default: 30d)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startOfYear, subDays, subMonths } from 'date-fns'

function isAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  const role = (session?.user as { role?: string } | undefined)?.role
  return ['ADMIN', 'COMMERCIAL'].includes(role ?? '')
}

function getPeriodStart(period: string): Date {
  const now = new Date()
  if (period === '90d')  return subDays(now, 90)
  if (period === '12m')  return subMonths(now, 12)
  if (period === 'ytd')  return startOfYear(now)
  return subDays(now, 30) // default: 30d
}

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const period     = searchParams.get('period') ?? '30d'
  const periodStart = getPeriodStart(period)

  // ── 1. Tabela Transaction (fonte primária) ────────────────────────────────
  const transactions = await prisma.transaction.findMany({
    where: {
      status:     { in: ['APPROVED'] },
      occurredAt: { gte: periodStart },
    },
    select: {
      type:           true,
      gateway:        true,
      currency:       true,
      grossAmount:    true,
      profitAmount:   true,
      profitMarginPct: true,
      gatewayFee:     true,
      costAmount:     true,
      profileType:    true,
      fxRateBrlUsd:   true,
    },
  })

  // ── 2. QuickSaleCheckout — fallback para quando Transaction ainda está vazia
  const checkouts = await prisma.quickSaleCheckout.findMany({
    where: {
      status:  'PAID',
      paidAt:  { gte: periodStart },
    },
    select: {
      totalAmount: true,
      qty:         true,
      paidAt:      true,
      listing: {
        select: {
          pricePerUnit:      true,
          destinationProfile: true,
        },
      },
    },
  })

  // ── 3. Subscriptions — MRR e ARR ─────────────────────────────────────────
  const activeSubs = await prisma.subscription.findMany({
    where: { status: { in: ['ACTIVE', 'TRIAL'] } },
    select: {
      profileType:  true,
      currency:     true,
      amount:       true,
      billingCycle: true,
      gateway:      true,
    },
  })

  // ── Cálculos ─────────────────────────────────────────────────────────────

  // Fallback: se não há Transactions, usa Checkouts para faturamento transacional
  const useCheckoutFallback = transactions.length === 0

  let totalRevenueBrl  = 0
  let totalProfitBrl   = 0
  let totalRevenueUsd  = 0
  const byType:    Record<string, { revenue: number; profit: number; count: number }> = {}
  const byGateway: Record<string, { revenue: number; count: number }> = {}
  const byCurrency: Record<string, number> = {}
  const byProfile: Record<string, { revenue: number; profit: number; count: number }> = {}

  if (!useCheckoutFallback) {
    for (const t of transactions) {
      const gross  = Number(t.grossAmount)
      const profit = Number(t.profitAmount)
      const isUsd  = t.currency === 'USD'
      const brl    = isUsd ? gross * (Number(t.fxRateBrlUsd ?? 5.2) / 1) : gross

      totalRevenueBrl += brl
      totalProfitBrl  += isUsd ? profit * (Number(t.fxRateBrlUsd ?? 5.2)) : profit
      if (isUsd) totalRevenueUsd += gross

      const k = t.type
      byType[k] = byType[k] ?? { revenue: 0, profit: 0, count: 0 }
      byType[k].revenue += brl
      byType[k].profit  += isUsd ? profit * Number(t.fxRateBrlUsd ?? 5.2) : profit
      byType[k].count   += 1

      const g = t.gateway
      byGateway[g] = byGateway[g] ?? { revenue: 0, count: 0 }
      byGateway[g].revenue += brl
      byGateway[g].count   += 1

      byCurrency[t.currency] = (byCurrency[t.currency] ?? 0) + gross

      const p = t.profileType ?? 'UNKNOWN'
      byProfile[p] = byProfile[p] ?? { revenue: 0, profit: 0, count: 0 }
      byProfile[p].revenue += brl
      byProfile[p].profit  += isUsd ? profit * Number(t.fxRateBrlUsd ?? 5.2) : profit
      byProfile[p].count   += 1
    }
  } else {
    // Fallback: usa Checkouts como proxy de receita transacional
    for (const co of checkouts) {
      const gross = Number(co.totalAmount)
      totalRevenueBrl += gross
      totalProfitBrl  += gross * 0.4 // estimativa de 40% margem como placeholder

      byType['ASSET_SALE'] = byType['ASSET_SALE'] ?? { revenue: 0, profit: 0, count: 0 }
      byType['ASSET_SALE'].revenue += gross
      byType['ASSET_SALE'].profit  += gross * 0.4
      byType['ASSET_SALE'].count   += 1

      byGateway['INTER'] = byGateway['INTER'] ?? { revenue: 0, count: 0 }
      byGateway['INTER'].revenue += gross
      byGateway['INTER'].count   += 1

      byCurrency['BRL'] = (byCurrency['BRL'] ?? 0) + gross

      const p = co.listing.destinationProfile ?? 'TRADER_WHATSAPP'
      byProfile[p] = byProfile[p] ?? { revenue: 0, profit: 0, count: 0 }
      byProfile[p].revenue += gross
      byProfile[p].profit  += gross * 0.4
      byProfile[p].count   += 1
    }
  }

  // MRR / ARR de assinaturas ativas
  let mrrBrl = 0
  let arrBrl = 0
  const subsByProfile: Record<string, { mrr: number; count: number }> = {}

  for (const s of activeSubs) {
    const monthlyBrl = s.currency === 'USD'
      ? Number(s.amount) * 5.2 // câmbio fixo para MRR
      : Number(s.amount)
    const monthly = s.billingCycle === 'ANNUAL'
      ? monthlyBrl / 12
      : s.billingCycle === 'QUARTERLY'
        ? monthlyBrl / 3
        : monthlyBrl

    mrrBrl += monthly
    arrBrl += monthly * 12

    const p = s.profileType ?? 'UNKNOWN'
    subsByProfile[p] = subsByProfile[p] ?? { mrr: 0, count: 0 }
    subsByProfile[p].mrr   += monthly
    subsByProfile[p].count += 1
  }

  // ── Resumo projetado anualizado ──────────────────────────────────────────
  const daysInPeriod = period === '90d' ? 90 : period === '12m' ? 365 : period === 'ytd' ? 365 : 30
  const runRate8d = ((totalRevenueBrl + arrBrl) / daysInPeriod) * 365

  return NextResponse.json({
    period,
    periodStart,
    summary: {
      totalRevenueBrl:   Math.round(totalRevenueBrl * 100) / 100,
      totalProfitBrl:    Math.round(totalProfitBrl  * 100) / 100,
      totalRevenueUsd:   Math.round(totalRevenueUsd * 100) / 100,
      marginPct:         totalRevenueBrl > 0
        ? Math.round((totalProfitBrl / totalRevenueBrl) * 10000) / 100
        : 0,
      mrrBrl:            Math.round(mrrBrl * 100) / 100,
      arrBrl:            Math.round(arrBrl * 100) / 100,
      annualizedRunRateBrl: Math.round(runRate8d * 100) / 100,
      activeSubscriptions:  activeSubs.length,
      transactionCount:     useCheckoutFallback ? checkouts.length : transactions.length,
      dataSource:           useCheckoutFallback ? 'checkout_fallback' : 'transactions',
    },
    byType:     Object.entries(byType).map(([type, v])    => ({ type, ...v })),
    byGateway:  Object.entries(byGateway).map(([gateway, v]) => ({ gateway, ...v })),
    byCurrency: Object.entries(byCurrency).map(([currency, amount]) => ({ currency, amount })),
    byProfile:  Object.entries(byProfile).map(([profileType, v])   => ({ profileType, ...v })),
    mrr: {
      total:     Math.round(mrrBrl * 100) / 100,
      byProfile: Object.entries(subsByProfile).map(([profileType, v]) => ({ profileType, ...v })),
    },
  })
}
