/**
 * GET  /api/admin/mercury  — Health + Saldo + Transações recentes Mercury
 * POST /api/admin/mercury  — Instruções para configurar webhook (não cria via API)
 *
 * Mercury não expõe endpoint de criação de webhooks via API pública;
 * a configuração é feita pelo Dashboard: Settings → Developer → Webhooks.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import {
  checkMercuryHealth,
  getMercuryAccounts,
  getRecentMercuryTransactions,
  getFxRates,
} from '@/lib/mercury/client'
import { prisma } from '@/lib/prisma'
import { subDays } from 'date-fns'

function onlyAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return (session?.user as { role?: string } | undefined)?.role === 'ADMIN'
}

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!onlyAdmin(session)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  // ── Config check ─────────────────────────────────────────────────────────────
  const configured = Boolean(process.env.MERCURY_API_KEY)
  const accountId  = process.env.MERCURY_ACCOUNT_ID ?? null
  const webhookConfigured = Boolean(process.env.MERCURY_WEBHOOK_SECRET)

  if (!configured) {
    return NextResponse.json({
      ok:         false,
      configured: false,
      message:    'MERCURY_API_KEY não configurada — adicione ao .env',
      setup: {
        steps: [
          '1. Acesse Mercury Dashboard → Settings → API Tokens',
          '2. Gere um token Read-Only (para monitoring)',
          '3. Adicione MERCURY_API_KEY=seu-token ao .env',
          '4. Adicione MERCURY_ACCOUNT_ID=id-da-conta-checking',
          '5. Crie webhook em: Mercury → Settings → Developer → Webhooks',
          '   URL: https://seu-dominio.com/api/webhooks/mercury',
          '   Events: transaction.created, transaction.updated',
          '6. Copie o secretKey e adicione MERCURY_WEBHOOK_SECRET ao .env',
        ],
      },
    })
  }

  // ── Health + Accounts ─────────────────────────────────────────────────────────
  const [health, accounts, fx] = await Promise.allSettled([
    checkMercuryHealth(),
    getMercuryAccounts(),
    getFxRates(),
  ])

  const healthData = health.status === 'fulfilled' ? health.value : { ok: false, error: String(health.reason) }
  const accountsData = accounts.status === 'fulfilled' ? accounts.value : []
  const fxData = fx.status === 'fulfilled' ? fx.value : null

  // ── Transações recentes (Mercury API) ──────────────────────────────────────
  let recentTxs: Awaited<ReturnType<typeof getRecentMercuryTransactions>> = []
  if (accountId && health.status === 'fulfilled' && healthData.ok) {
    try {
      recentTxs = await getRecentMercuryTransactions(20)
    } catch {
      recentTxs = []
    }
  }

  // ── Histórico interno Mercury (Transactions no banco) ─────────────────────
  const internalTxs = await prisma.transaction.findMany({
    where: {
      gateway:    'MERCURY',
      status:     'APPROVED',
      occurredAt: { gte: subDays(new Date(), 90) },
    },
    orderBy: { occurredAt: 'desc' },
    take: 50,
    select: {
      id:          true,
      grossAmount: true,
      profitAmount: true,
      currency:    true,
      fxRateBrlUsd: true,
      externalRef: true,
      occurredAt:  true,
      clientId:    true,
    },
  })

  const totalUsdReceived = internalTxs.reduce((s, t) => s + Number(t.grossAmount), 0)
  const fxRate           = fxData?.rates['BRL'] ?? 5.20
  const totalBrlEquiv    = totalUsdReceived * fxRate

  // ── KPIs consolidados ──────────────────────────────────────────────────────
  const checkingAccount = accountsData.find((a) => a.type === 'checking')

  return NextResponse.json({
    ok:               true,
    configured,
    webhookConfigured,
    accountId:        accountId ?? null,
    health:           healthData,

    balance: {
      availableUsd: checkingAccount?.availableBalance ?? healthData.totalUsd ?? 0,
      currentUsd:   checkingAccount?.currentBalance ?? 0,
      fxRate,
      fxUpdatedAt:  fxData?.updatedAt ?? 'fallback',
      equivalentBrl: Math.round((checkingAccount?.availableBalance ?? 0) * fxRate),
    },

    accounts: accountsData.map((a) => ({
      id:              a.id,
      name:            a.name,
      type:            a.type,
      status:          a.status,
      availableBalance: a.availableBalance,
      currentBalance:  a.currentBalance,
    })),

    recentTransactions: recentTxs.slice(0, 10).map((t) => ({
      id:            t.id,
      amount:        t.amount,
      currency:      t.currency,
      kind:          t.kind,
      status:        t.status,
      counterparty:  t.counterpartyName,
      memo:          t.externalMemo ?? t.note,
      postedAt:      t.postedAt ?? t.createdAt,
    })),

    internalHistory: {
      count:          internalTxs.length,
      totalUsdReceived: Math.round(totalUsdReceived * 100) / 100,
      totalBrlEquiv:  Math.round(totalBrlEquiv),
      transactions:   internalTxs.slice(0, 10).map((t) => ({
        id:          t.id,
        amountUsd:   Number(t.grossAmount),
        fxRate:      Number(t.fxRateBrlUsd ?? fxRate),
        occurredAt:  t.occurredAt,
        externalRef: t.externalRef,
      })),
    },

    setup: {
      webhookUrl: `${process.env.NEXTAUTH_URL ?? 'https://seu-dominio.com'}/api/webhooks/mercury`,
      eventTypes: ['transaction.created', 'transaction.updated'],
      filterPaths: ['status', 'amount', 'kind'],
    },
  })
}

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!onlyAdmin(session)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  // Mercury não oferece endpoint para criar webhooks via API — apenas via dashboard
  return NextResponse.json({
    ok:      true,
    message: 'Mercury não suporta criação de webhooks via API. Configure manualmente no dashboard.',
    steps: [
      'Acesse: https://app.mercury.com/settings/webhooks',
      `URL: ${process.env.NEXTAUTH_URL ?? 'https://seu-dominio.com'}/api/webhooks/mercury`,
      'Selecione eventos: transaction.created, transaction.updated',
      'Copie o secretKey gerado e adicione como MERCURY_WEBHOOK_SECRET no .env',
    ],
  })
}
