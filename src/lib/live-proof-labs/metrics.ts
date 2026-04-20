import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

function dec(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0
  return Number(v)
}

export async function approvedRevenueSince(offerId: string, since: Date): Promise<number> {
  const r = await prisma.trackerOfferSaleSignal.aggregate({
    where: {
      offerId,
      paymentState: 'APPROVED',
      countedForRevenue: true,
      createdAt: { gte: since },
    },
    _sum: { amountGross: true },
  })
  return dec(r._sum.amountGross)
}

export async function trackerDaySeriesForOffer(
  offerId: string,
  days: number,
): Promise<{
  labels: string[]
  checkouts: number[]
  salesCount: number[]
  revenueBrl: number[]
}> {
  const since = new Date(Date.now() - days * 86400000)
  since.setUTCHours(0, 0, 0, 0)

  const [inits, signals] = await Promise.all([
    prisma.trackerCheckoutInitiation.findMany({
      where: { offerId, outcome: 'REDIRECT_302', createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    prisma.trackerOfferSaleSignal.findMany({
      where: {
        offerId,
        paymentState: 'APPROVED',
        countedForRevenue: true,
        createdAt: { gte: since },
      },
      select: { createdAt: true, amountGross: true },
    }),
  ])

  const dayKey = (d: Date) => d.toISOString().slice(0, 10)
  const labels: string[] = []
  for (let i = 0; i < days; i++) {
    const x = new Date(since)
    x.setUTCDate(x.getUTCDate() + i)
    labels.push(dayKey(x))
  }

  const checkoutMap = new Map<string, number>()
  for (const row of inits) {
    const k = dayKey(row.createdAt)
    checkoutMap.set(k, (checkoutMap.get(k) || 0) + 1)
  }

  const salesCountMap = new Map<string, number>()
  const revenueMap = new Map<string, number>()
  for (const row of signals) {
    const k = dayKey(row.createdAt)
    salesCountMap.set(k, (salesCountMap.get(k) || 0) + 1)
    revenueMap.set(k, (revenueMap.get(k) || 0) + dec(row.amountGross))
  }

  return {
    labels,
    checkouts: labels.map((k) => checkoutMap.get(k) || 0),
    salesCount: labels.map((k) => salesCountMap.get(k) || 0),
    revenueBrl: labels.map((k) => revenueMap.get(k) || 0),
  }
}

export function computeRoiNetPercent(opts: { revenue: number; spend: number }): number | null {
  if (opts.spend <= 0) return null
  return ((opts.revenue - opts.spend) / opts.spend) * 100
}
