import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'FINANCE'] as const

export async function GET(req: Request) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const u = new URL(req.url)
  const takeLeads = Math.min(100, Math.max(10, Number(u.searchParams.get('takeLeads')) || 40))
  const takeCampaigns = Math.min(50, Math.max(5, Number(u.searchParams.get('takeCampaigns')) || 20))

  const topLeads = await prisma.trackerLeadLtvAggregate.findMany({
    orderBy: { totalGross: 'desc' },
    take: takeLeads,
    select: {
      id: true,
      buyerHint: true,
      totalGross: true,
      purchaseCount: true,
      currency: true,
      attributedCampaignId: true,
      attributedOfferId: true,
      firstPurchaseAt: true,
      lastPurchaseAt: true,
    },
  })

  const aggRows = await prisma.trackerLeadLtvAggregate.findMany({
    where: { attributedCampaignId: { not: null } },
    select: { attributedCampaignId: true, totalGross: true, purchaseCount: true },
  })
  const campMap = new Map<string, { total: Prisma.Decimal; purchases: number }>()
  for (const r of aggRows) {
    const id = r.attributedCampaignId as string
    const cur = campMap.get(id) ?? { total: new Prisma.Decimal(0), purchases: 0 }
    cur.total = cur.total.add(r.totalGross)
    cur.purchases += r.purchaseCount
    campMap.set(id, cur)
  }
  const byCampaign = [...campMap.entries()]
    .map(([campaignId, v]) => ({
      campaignId,
      totalGross: v.total,
      purchaseCount: v.purchases,
    }))
    .sort((a, b) => b.totalGross.comparedTo(a.totalGross))
    .slice(0, takeCampaigns)

  const purchaseTotal = await prisma.trackerLeadLtvPurchase.count()

  return NextResponse.json({
    topLeads: topLeads.map((r) => ({
      id: r.id,
      buyerHint: r.buyerHint,
      totalGross: r.totalGross.toString(),
      purchaseCount: r.purchaseCount,
      currency: r.currency,
      attributedCampaignId: r.attributedCampaignId,
      attributedOfferId: r.attributedOfferId,
      firstPurchaseAt: r.firstPurchaseAt.toISOString(),
      lastPurchaseAt: r.lastPurchaseAt.toISOString(),
    })),
    byCampaign: byCampaign.map((r) => ({
      ...r,
      totalGross: r.totalGross?.toString() ?? '0',
      purchaseCount: r.purchaseCount ?? 0,
    })),
    purchaseTotal,
  })
}
