import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import {
  breakEvenSignal,
  contributionMarginReal,
  monthRange,
  supplyRenewalAlerts,
  accountsReceivablePending,
  pendingWithdrawalsTotal,
  payablesDueTomorrow,
} from '@/lib/vault-intelligence'

const ROLES = ['ADMIN', 'FINANCE'] as const

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role as (typeof ROLES)[number])) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1), 10)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10)
  const range = monthRange(year, month)

  const [margin, breakEven, renewals, ar, payables, tomorrowPay] = await Promise.all([
    contributionMarginReal(range),
    breakEvenSignal(range),
    supplyRenewalAlerts(14),
    accountsReceivablePending(),
    pendingWithdrawalsTotal(),
    payablesDueTomorrow(),
  ])

  return NextResponse.json({
    period: { month, year },
    contributionMargin: margin,
    breakEven,
    liquiditySnapshot: {
      accountsReceivable: ar,
      pendingWithdrawals: payables,
      payablesTomorrow: tomorrowPay,
    },
    supplyRenewalAlerts: renewals,
  })
}
