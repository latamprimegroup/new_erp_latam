import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/api-auth'
import { ORDER_STATUSES_LTV } from '@/lib/intelligence-leads-engine'

const ROLES = ['ADMIN', 'FINANCE', 'COMMERCIAL'] as const

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * GET — cohort mensal: compradores da cohort que voltaram a comprar em M+1, M+2…
 */
export async function GET(req: Request) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const monthsBack = Math.min(24, Math.max(3, parseInt(url.searchParams.get('months') || '9', 10) || 9))

  const orders = await prisma.order.findMany({
    where: {
      status: { in: ORDER_STATUSES_LTV },
      paidAt: { not: null },
    },
    select: { clientId: true, paidAt: true },
    orderBy: { paidAt: 'asc' },
    take: 80_000,
  })

  const firstMonthByClient = new Map<string, string>()
  const monthsByClient = new Map<string, Set<string>>()

  for (const o of orders) {
    const paid = o.paidAt!
    const mk = monthKey(paid)
    if (!monthsByClient.has(o.clientId)) monthsByClient.set(o.clientId, new Set())
    monthsByClient.get(o.clientId)!.add(mk)
    if (!firstMonthByClient.has(o.clientId)) {
      firstMonthByClient.set(o.clientId, mk)
    }
  }

  const cohortSizes = new Map<string, number>()
  for (const [, fm] of firstMonthByClient) {
    cohortSizes.set(fm, (cohortSizes.get(fm) ?? 0) + 1)
  }

  const cohortKeys = [...cohortSizes.keys()].sort().slice(-monthsBack)

  const cohorts = cohortKeys.map((cohortMonth) => {
    const clients = [...firstMonthByClient.entries()].filter(([, fm]) => fm === cohortMonth).map(([id]) => id)
    const size = clients.length
    const retention: Record<string, number> = {}
    if (size === 0) {
      return { cohort_month: cohortMonth, buyers_first_month: 0, retention_next_months_pct: retention }
    }
    const [cy, cm] = cohortMonth.split('-').map(Number)
    for (let delta = 1; delta <= 6; delta++) {
      const nm = new Date(Date.UTC(cy!, cm! - 1 + delta, 1))
      const nk = monthKey(nm)
      let back = 0
      for (const cid of clients) {
        if (monthsByClient.get(cid)?.has(nk)) back++
      }
      retention[`m_plus_${delta}_pct`] = Math.round((back / size) * 1000) / 10
    }
    return {
      cohort_month: cohortMonth,
      buyers_first_month: size,
      retention_next_months_pct: retention,
    }
  })

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    months_back: monthsBack,
    cohorts,
    note: 'Cohort = primeiro mês com pagamento confirmado no ERP; M+N = % desses clientes com pelo menos uma compra nesse mês.',
  })
}
