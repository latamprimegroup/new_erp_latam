/**
 * GET  /api/admin/war-room   — Cockpit CEO: KPIs, cash flow, fornecedores
 * POST /api/admin/war-room   — Stop Loss: suspender/reativar fornecedor
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { subMonths, startOfMonth, endOfMonth, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { checkMercuryHealth, getFxRates } from '@/lib/mercury/client'
import { getKastBalances, checkKastHealth } from '@/lib/kast/client'

function onlyAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return (session?.user as { role?: string } | undefined)?.role === 'ADMIN'
}

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// GET — War Room cockpit
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!onlyAdmin(session)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const now = new Date()
  const start30d = subMonths(now, 1)
  const start365d = subMonths(now, 12)

  // ── Mercury + FX em paralelo com o restante ──────────────────────────────
  const mercuryEnabled = Boolean(process.env.MERCURY_API_KEY)

  // ── Correr todas as queries em paralelo ───────────────────────────────────
  const [
    incomeAgg,
    expenseAgg,
    incomeAgg365,
    expenseAgg365,
    profitTransactions,
    adSpendSum,
    assetsByStatus,
    openRmas,
    activeSubs,
    vendors,
    checkouts12m,
    transactions12m,
    transactionsByProfile,
    mercuryHealthRaw,
    fxRatesRaw,
    kastRaw,
  ] = await Promise.all([
    // Receita mês atual (FinancialEntry)
    prisma.financialEntry.aggregate({
      where: { type: 'INCOME', date: { gte: start30d } },
      _sum: { value: true },
    }),
    // Custo mês atual
    prisma.financialEntry.aggregate({
      where: { type: 'EXPENSE', date: { gte: start30d } },
      _sum: { value: true },
    }),
    // Receita 365d
    prisma.financialEntry.aggregate({
      where: { type: 'INCOME', date: { gte: start365d } },
      _sum: { value: true },
    }),
    // Custo 365d
    prisma.financialEntry.aggregate({
      where: { type: 'EXPENSE', date: { gte: start365d } },
      _sum: { value: true },
    }),
    // Transações aprovadas (para profit USD)
    prisma.transaction.findMany({
      where: { status: 'APPROVED', occurredAt: { gte: start30d } },
      select: { grossAmount: true, profitAmount: true, currency: true, fxRateBrlUsd: true },
    }),
    // Soma total gasto em ads (AdSpendLog 365d) — para ROI
    prisma.adSpendLog.aggregate({
      where: { date: { gte: start365d } },
      _sum: { spendBrl: true },
    }),
    // Ativos por status
    prisma.asset.groupBy({
      by: ['status'],
      _count: { id: true },
    }),
    // RMAs abertas
    prisma.rMATicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    // Assinaturas ativas
    prisma.subscription.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { amount: true, currency: true, billingCycle: true, profileType: true },
    }),
    // Fornecedores com contagem de ativos e RMAs
    prisma.vendor.findMany({
      select: {
        id: true,
        name: true,
        category: true,
        suspended: true,
        suspendedAt: true,
        suspendedReason: true,
        rating: true,
        _count: { select: { assets: true, rmaTickets: true } },
      },
      orderBy: { name: 'asc' },
    }),
    // Checkouts pagos — últimos 12 meses (para cash flow)
    prisma.quickSaleCheckout.findMany({
      where: { status: 'PAID', paidAt: { gte: start365d } },
      select: { totalAmount: true, paidAt: true },
    }),
    // Transações aprovadas — últimos 12 meses (para cash flow)
    prisma.transaction.findMany({
      where: { status: 'APPROVED', occurredAt: { gte: start365d } },
      select: { grossAmount: true, type: true, occurredAt: true, currency: true, fxRateBrlUsd: true },
    }),
    // LTV por perfil
    prisma.transaction.findMany({
      where: { status: 'APPROVED' },
      select: { grossAmount: true, currency: true, fxRateBrlUsd: true, profileType: true, clientId: true },
    }),
    // Mercury balance (não bloqueia se falhar)
    mercuryEnabled
      ? checkMercuryHealth().catch(() => ({ ok: false, accounts: 0, totalUsd: 0 }))
      : Promise.resolve({ ok: false, accounts: 0, totalUsd: 0 }),
    // FX rate USD→BRL
    getFxRates().catch(() => ({ base: 'USD', rates: { BRL: 5.20 }, updatedAt: 'fallback' })),
    // Kast cripto (não bloqueia se falhar)
    Boolean(process.env.NOWPAYMENTS_API_KEY)
      ? Promise.allSettled([checkKastHealth(), getKastBalances()])
          .then(([h, b]) => ({
            ok:       h.status === 'fulfilled' ? h.value.ok : false,
            balances: b.status === 'fulfilled' ? b.value : [],
          }))
          .catch(() => ({ ok: false, balances: [] }))
      : Promise.resolve({ ok: false, balances: [] }),
  ])

  // ── Profit Real ───────────────────────────────────────────────────────────
  const incomeBrl = Number(incomeAgg._sum.value ?? 0)
  const expenseBrl = Number(expenseAgg._sum.value ?? 0)
  const profitBrl = incomeBrl - expenseBrl

  // Se não há FinancialEntry, usa Transactions como fallback
  const txProfit = profitTransactions.reduce((acc, t) => {
    const p = Number(t.profitAmount ?? 0)
    const isUsd = t.currency === 'USD'
    return acc + (isUsd ? p * Number(t.fxRateBrlUsd ?? 5.2) : p)
  }, 0)
  const finalProfitBrl = profitBrl > 0 ? profitBrl : txProfit

  // Profit USD (estimado via câmbio médio)
  const finalProfitUsd = finalProfitBrl / 5.2

  // ── ROI 365 ───────────────────────────────────────────────────────────────
  const totalAdSpend = Number(adSpendSum._sum.spendBrl ?? 0)
  const income365 = Number(incomeAgg365._sum.value ?? 0)
  const expense365 = Number(expenseAgg365._sum.value ?? 0)
  const profit365 = income365 > 0 ? income365 - expense365 : txProfit
  const roi365 = totalAdSpend > 0 ? Math.round((profit365 / totalAdSpend) * 100) : 0

  // ── MRR ───────────────────────────────────────────────────────────────────
  let mrrBrl = 0
  for (const s of activeSubs) {
    const monthly = s.billingCycle === 'ANNUAL'
      ? Number(s.amount) / 12
      : s.billingCycle === 'QUARTERLY'
        ? Number(s.amount) / 3
        : Number(s.amount)
    mrrBrl += s.currency === 'USD' ? monthly * 5.2 : monthly
  }

  // ── Infra Health ─────────────────────────────────────────────────────────
  const statusMap: Record<string, number> = {}
  for (const g of assetsByStatus) statusMap[g.status] = g._count.id
  const totalAssets = Object.values(statusMap).reduce((a, b) => a + b, 0)
  const activeAssets = (statusMap['AVAILABLE'] ?? 0) + (statusMap['QUARANTINE'] ?? 0)
  const deadAssets = statusMap['DEAD'] ?? 0
  const healthPct = totalAssets > 0 ? Math.round((activeAssets / totalAssets) * 100) : 100

  // ── LTV por Perfil ───────────────────────────────────────────────────────
  const ltvMap: Record<string, { total: number; clients: Set<string> }> = {}
  for (const t of transactionsByProfile) {
    const profile = t.profileType ?? 'OUTROS'
    const brl = t.currency === 'USD'
      ? Number(t.grossAmount) * Number(t.fxRateBrlUsd ?? 5.2)
      : Number(t.grossAmount)
    if (!ltvMap[profile]) ltvMap[profile] = { total: 0, clients: new Set() }
    ltvMap[profile].total += brl
    if (t.clientId) ltvMap[profile].clients.add(t.clientId)
  }
  const ltvByProfile = Object.entries(ltvMap).map(([profile, v]) => ({
    profile,
    avgLtv: v.clients.size > 0 ? Math.round(v.total / v.clients.size) : Math.round(v.total),
    totalRevenue: Math.round(v.total),
    clientCount: v.clients.size,
  })).sort((a, b) => b.avgLtv - a.avgLtv)

  // ── Cash Flow — últimos 12 meses ─────────────────────────────────────────
  const months: { label: string; sales: number; recurring: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = subMonths(now, i)
    const mStart = startOfMonth(d)
    const mEnd = endOfMonth(d)

    // Vendas únicas (Checkout + Transactions ASSET_SALE)
    const salesFromCheckout = checkouts12m
      .filter((c) => c.paidAt && new Date(c.paidAt) >= mStart && new Date(c.paidAt) <= mEnd)
      .reduce((acc, c) => acc + Number(c.totalAmount), 0)

    const salesFromTx = transactions12m
      .filter(
        (t) =>
          t.type === 'ASSET_SALE' &&
          t.occurredAt &&
          new Date(t.occurredAt) >= mStart &&
          new Date(t.occurredAt) <= mEnd,
      )
      .reduce((acc, t) => {
        const brl = t.currency === 'USD'
          ? Number(t.grossAmount) * Number(t.fxRateBrlUsd ?? 5.2)
          : Number(t.grossAmount)
        return acc + brl
      }, 0)

    const salesTotal = salesFromCheckout > 0 ? salesFromCheckout : salesFromTx

    // Recorrência (RECURRING transactions nesse mês)
    const recurringTotal = transactions12m
      .filter(
        (t) =>
          t.type === 'RECURRING' &&
          t.occurredAt &&
          new Date(t.occurredAt) >= mStart &&
          new Date(t.occurredAt) <= mEnd,
      )
      .reduce((acc, t) => {
        const brl = t.currency === 'USD'
          ? Number(t.grossAmount) * Number(t.fxRateBrlUsd ?? 5.2)
          : Number(t.grossAmount)
        return acc + brl
      }, 0)

    months.push({
      label: format(d, 'MMM/yy', { locale: ptBR }),
      sales: Math.round(salesTotal),
      recurring: Math.round(recurringTotal > 0 ? recurringTotal : mrrBrl),
    })
  }

  // ── Fornecedores Stop Loss ───────────────────────────────────────────────
  const vendorData = vendors.map((v) => {
    const total = v._count.assets
    const rmaCount = v._count.rmaTickets
    const rmaRate = total > 0 ? Math.round((rmaCount / total) * 100) : 0
    return {
      id: v.id,
      name: v.name,
      category: v.category,
      totalAssets: total,
      rmaCount,
      rmaRate,
      suspended: v.suspended,
      suspendedAt: v.suspendedAt,
      suspendedReason: v.suspendedReason,
      rating: v.rating,
      alert: rmaRate >= 30,
    }
  }).sort((a, b) => b.rmaRate - a.rmaRate)

  // ── Alertas ───────────────────────────────────────────────────────────────
  const alerts: { type: string; message: string }[] = []
  if (openRmas > 5) alerts.push({ type: 'critical', message: `🔴 ${openRmas} RMAs abertos — ação imediata necessária` })
  if (healthPct < 70) alerts.push({ type: 'critical', message: `🔴 Saúde da Infra em ${healthPct}% — estoque crítico` })
  if (deadAssets > 0) alerts.push({ type: 'warning', message: `⚠️ ${deadAssets} ativo(s) DEAD — verificar fornecedor` })
  const vendorsAtRisk = vendorData.filter((v) => v.alert && !v.suspended)
  if (vendorsAtRisk.length > 0) {
    alerts.push({ type: 'warning', message: `⚠️ ${vendorsAtRisk.length} fornecedor(es) com RMA ≥ 30% — Stop Loss recomendado` })
  }
  if (mrrBrl === 0) alerts.push({ type: 'info', message: 'ℹ️ Sem assinaturas ativas — ative o módulo de recorrência' })

  // ── Mercury ──────────────────────────────────────────────────────────────
  const fxRateBrl = (fxRatesRaw as { rates: Record<string, number> }).rates?.BRL ?? 5.20
  const mercuryUsd = mercuryEnabled ? (mercuryHealthRaw as { totalUsd?: number }).totalUsd ?? 0 : 0
  const mercuryBrl = Math.round(mercuryUsd * fxRateBrl)

  // ── Kast Cripto ───────────────────────────────────────────────────────────
  const kastData = kastRaw as { ok: boolean; balances: { currency: string; amount: number; pending: number }[] }
  const kastStableUsd = kastData.balances
    .filter((b) => b.currency.startsWith('usdt') || b.currency.startsWith('usdc'))
    .reduce((s, b) => s + b.amount + b.pending, 0)
  const kastBrl = Math.round(kastStableUsd * fxRateBrl)

  // Receita global consolidada BRL (doméstico + Mercury USD + Kast cripto)
  const globalRevenueBrl = Math.round(finalProfitBrl + mercuryBrl + kastBrl)

  return NextResponse.json({
    kpis: {
      profitBrl: Math.round(finalProfitBrl),
      profitUsd: Math.round(finalProfitUsd),
      roi365,
      adSpendBrl: Math.round(totalAdSpend),
      mrrBrl: Math.round(mrrBrl),
      infraHealth: {
        active: activeAssets,
        dead: deadAssets,
        total: totalAssets,
        healthPct,
        openRmas,
      },
      activeSubscriptions: activeSubs.length,
      ltvByProfile,
      // Multi-moeda consolidado
      mercury: {
        configured:   mercuryEnabled,
        balanceUsd:   mercuryUsd,
        balanceBrl:   mercuryBrl,
        health:       (mercuryHealthRaw as { ok?: boolean }).ok ?? false,
        fxRate:       fxRateBrl,
      },
      kast: {
        configured:   Boolean(process.env.NOWPAYMENTS_API_KEY),
        health:       kastData.ok,
        stableUsd:    Math.round(kastStableUsd * 100) / 100,
        stableBrl:    kastBrl,
        fxRate:       fxRateBrl,
      },
      globalRevenueBrl,
    },
    cashFlow: months,
    vendors: vendorData.slice(0, 20),
    alerts,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — Stop Loss: suspender ou reativar fornecedor
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!onlyAdmin(session)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json()
  const { vendorId, suspend, reason } = body as {
    vendorId: string
    suspend: boolean
    reason?: string
  }

  if (!vendorId) {
    return NextResponse.json({ error: 'vendorId obrigatório' }, { status: 400 })
  }

  const vendor = await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      suspended: suspend,
      suspendedReason: suspend ? (reason ?? 'Stop Loss ativado pelo CEO via War Room') : null,
      suspendedAt: suspend ? new Date() : null,
    },
    select: { id: true, name: true, suspended: true, suspendedAt: true },
  })

  // Auditoria
  await prisma.auditLog.create({
    data: {
      action: suspend ? 'VENDOR_STOP_LOSS' : 'VENDOR_REACTIVATED',
      entity: 'Vendor',
      entityId: vendorId,
      userId: (session!.user as { id?: string }).id ?? null,
      details: { reason: reason ?? null },
    },
  }).catch(() => null) // não bloqueia se falhar

  return NextResponse.json({ ok: true, vendor })
}
