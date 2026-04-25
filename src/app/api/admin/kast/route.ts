/**
 * GET /api/admin/kast — Tesouraria Cripto: health + saldo + histórico
 *
 * Retorna:
 *   - Health check da NOWPayments API
 *   - Saldo por moeda (cripto ainda na conta NOWPayments)
 *   - Total recebido (histórico de Transactions gateway=KAST)
 *   - Lucro líquido cripto (após gas fees)
 *   - Últimas transações cripto processadas
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import {
  checkKastHealth,
  getKastBalances,
  SUPPORTED_COINS,
  type CryptoBalance,
} from '@/lib/kast/client'
import { getFxRates } from '@/lib/mercury/client'
import { prisma } from '@/lib/prisma'
import { subDays } from 'date-fns'

function onlyAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return (session?.user as { role?: string } | undefined)?.role === 'ADMIN'
}

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!onlyAdmin(session)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const configured    = Boolean(process.env.NOWPAYMENTS_API_KEY)
  const ipnConfigured = Boolean(process.env.NOWPAYMENTS_IPN_SECRET)

  if (!configured) {
    return NextResponse.json({
      ok:         false,
      configured: false,
      message:    'NOWPAYMENTS_API_KEY não configurada',
      setup: {
        steps: [
          '1. Acesse: dashboard.nowpayments.io → API Keys → Generate',
          '2. Adicione NOWPAYMENTS_API_KEY=sua-chave ao .env',
          '3. Em Settings → Payments → IPN → gere o IPN Secret',
          '4. Adicione NOWPAYMENTS_IPN_SECRET=seu-segredo ao .env',
          `5. Configure o IPN URL: ${process.env.NEXTAUTH_URL ?? 'https://seu-dominio.com'}/api/webhooks/kast`,
          '6. (Opcional) NOWPAYMENTS_CURRENCY=usdttrc20 para definir moeda padrão',
        ],
      },
    })
  }

  // ── Queries em paralelo ──────────────────────────────────────────────────────
  const [health, balancesResult, fxResult, kastTxs] = await Promise.allSettled([
    checkKastHealth(),
    getKastBalances(),
    getFxRates(),
    prisma.transaction.findMany({
      where: {
        gateway:    'KAST',
        status:     'APPROVED',
        occurredAt: { gte: subDays(new Date(), 90) },
      },
      orderBy: { occurredAt: 'desc' },
      take: 50,
      select: {
        id:            true,
        grossAmount:   true,
        gatewayFee:    true,
        profitAmount:  true,
        profitMarginPct: true,
        currency:      true,
        fxRateBrlUsd:  true,
        externalRef:   true,
        occurredAt:    true,
      },
    }),
  ])

  const healthData    = health.status === 'fulfilled'    ? health.value    : { ok: false, error: String(health.reason) }
  const balances: CryptoBalance[] = balancesResult.status === 'fulfilled' ? balancesResult.value : []
  const fx            = fxResult.status === 'fulfilled'  ? fxResult.value  : null
  const transactions  = kastTxs.status === 'fulfilled'   ? kastTxs.value   : []

  const brlRate = fx?.rates?.['BRL'] ?? 5.20

  // ── Saldo em USD equivalente ─────────────────────────────────────────────────
  const stableBalances = balances.filter((b) =>
    b.currency.startsWith('usdt') || b.currency.startsWith('usdc'),
  )
  const totalStableUsd = stableBalances.reduce((s, b) => s + b.amount + b.pending, 0)
  const totalStableBrl = Math.round(totalStableUsd * brlRate)

  // ── Histórico interno ────────────────────────────────────────────────────────
  const totalGrossUsd  = transactions.reduce((s, t) => s + Number(t.grossAmount), 0)
  const totalGasFeeUsd = transactions.reduce((s, t) => s + Number(t.gatewayFee), 0)
  const totalNetUsd    = transactions.reduce((s, t) => s + Number(t.profitAmount), 0)
  const totalNetBrl    = Math.round(totalNetUsd * brlRate)

  // ── Breakdown por moeda ──────────────────────────────────────────────────────
  const coinBreakdown: Record<string, { count: number; grossUsd: number }> = {}
  for (const tx of transactions) {
    const ref = tx.externalRef ?? 'unknown'
    const coin = 'USDT/USDC' // simplificado — sem detalhe por tx
    coinBreakdown[coin] = coinBreakdown[coin] ?? { count: 0, grossUsd: 0 }
    coinBreakdown[coin].count   += 1
    coinBreakdown[coin].grossUsd += Number(tx.grossAmount)
  }

  return NextResponse.json({
    ok:             true,
    configured,
    ipnConfigured,
    health:         healthData,
    defaultCoin:    process.env.NOWPAYMENTS_CURRENCY ?? 'usdttrc20',

    treasury: {
      // Saldo vivo em NOWPayments (cripto que ainda não foi sacado)
      walletBalances:  balances.map((b) => ({
        currency: b.currency,
        label:    SUPPORTED_COINS[b.currency as keyof typeof SUPPORTED_COINS]?.label ?? b.currency,
        amount:   b.amount,
        pending:  b.pending,
        totalUsd: b.amount + b.pending,
      })),
      totalStableUsd: Math.round(totalStableUsd * 100) / 100,
      totalStableBrl,

      // Histórico de conversões processadas (90 dias)
      history: {
        count:        transactions.length,
        totalGrossUsd: Math.round(totalGrossUsd * 100) / 100,
        totalGasFeeUsd: Math.round(totalGasFeeUsd * 100) / 100,
        totalNetUsd:   Math.round(totalNetUsd  * 100) / 100,
        totalNetBrl,
        avgMarginPct:  transactions.length > 0
          ? Math.round(transactions.reduce((s, t) => s + Number(t.profitMarginPct), 0) / transactions.length * 100) / 100
          : 0,
      },
      coinBreakdown: Object.entries(coinBreakdown).map(([coin, v]) => ({ coin, ...v })),
    },

    recentTransactions: transactions.slice(0, 10).map((t) => ({
      id:           t.id,
      grossUsd:     Number(t.grossAmount),
      gasFeeUsd:    Number(t.gatewayFee),
      netUsd:       Number(t.profitAmount),
      marginPct:    Number(t.profitMarginPct),
      fxRate:       Number(t.fxRateBrlUsd ?? brlRate),
      externalRef:  t.externalRef,
      occurredAt:   t.occurredAt,
    })),

    fxRate: brlRate,
    fxUpdatedAt: fx?.updatedAt ?? 'fallback',

    setup: {
      ipnUrl:   `${process.env.NEXTAUTH_URL ?? 'https://seu-dominio.com'}/api/webhooks/kast`,
      quoteUrl: `${process.env.NEXTAUTH_URL ?? 'https://seu-dominio.com'}/api/crypto/invoice?amount=500&currency=brl&coin=usdttrc20`,
    },
  })
}
