import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { technicalBadgesForOffer, whatsappHref } from '@/lib/manager-offer'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const startDay = new Date()
  startDay.setHours(0, 0, 0, 0)

  const [list, approvedToday, repositionsPending, availableManagerStock, managerStatsRows] = await Promise.all([
    prisma.stockAccount.findMany({
      where: { status: 'PENDING', managerId: { not: null }, deletedAt: null },
      include: {
        manager: { include: { user: { select: { name: true, email: true } } } },
        supplier: true,
        credential: {
          where: { deletedAt: null },
          select: {
            email: true,
            passwordEncrypted: true,
            twoFaSecret: true,
            proxyConfig: true,
            notes: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.stockAccount.count({
      where: {
        status: 'AVAILABLE',
        managerId: { not: null },
        deletedAt: null,
        updatedAt: { gte: startDay },
      },
    }),
    prisma.deliveryReposition.count({
      where: { status: 'SOLICITADA' },
    }),
    prisma.stockAccount.findMany({
      where: { status: 'AVAILABLE', managerId: { not: null }, deletedAt: null },
      select: { salePrice: true, purchasePrice: true },
    }),
    prisma.stockAccount.groupBy({
      by: ['managerId', 'status'],
      where: { managerId: { not: null }, deletedAt: null },
      _count: { id: true },
    }),
  ])

  const managerStats = new Map<string, { available: number; rejected: number }>()
  for (const row of managerStatsRows) {
    const mid = row.managerId as string
    if (!mid) continue
    const cur = managerStats.get(mid) ?? { available: 0, rejected: 0 }
    if (row.status === 'AVAILABLE') cur.available += row._count.id
    if (row.status === 'REJECTED') cur.rejected += row._count.id
    managerStats.set(mid, cur)
  }

  let marginSum = 0
  for (const a of availableManagerStock) {
    const sp = Number(a.salePrice ?? 0)
    const pp = Number(a.purchasePrice ?? 0)
    marginSum += Math.max(0, sp - pp)
  }
  const avgMarginPotential =
    availableManagerStock.length > 0 ? marginSum / availableManagerStock.length : 0

  const items = list.map((a) => {
    const cred = a.credential ?? null
    const badges = technicalBadgesForOffer({ status: a.status, credential: cred })
    const mid = a.managerId ?? ''
    const st = mid ? managerStats.get(mid) : undefined
    const purchase = Number(a.purchasePrice ?? 0)
    const sale = Number(a.salePrice ?? 0)
    const markup = a.markupPercent != null ? Number(a.markupPercent) : null

    return {
      id: a.id,
      platform: a.platform,
      type: a.type,
      niche: a.niche,
      status: a.status,
      purchasePrice: purchase,
      salePrice: sale,
      markupPercent: markup,
      description: a.description,
      offerReviewMeta: a.offerReviewMeta,
      createdAt: a.createdAt.toISOString(),
      displayName: a.type || 'Conta',
      manager: a.manager
        ? {
            name: a.manager.user.name,
            email: a.manager.user.email,
            stats: st
              ? { delivered: st.available, failed: st.rejected }
              : { delivered: 0, failed: 0 },
          }
        : null,
      supplier: a.supplier
        ? {
            name: a.supplier.name,
            contact: a.supplier.contact,
            whatsappUrl: whatsappHref(a.supplier.contact),
          }
        : null,
      technicalBadges: badges,
      hasCredential: !!cred,
    }
  })

  return NextResponse.json({
    summary: {
      pendingReview: list.length,
      approvedToday,
      repositionsPending,
      avgMarginPotential: Math.round(avgMarginPotential * 100) / 100,
    },
    items,
  })
}
