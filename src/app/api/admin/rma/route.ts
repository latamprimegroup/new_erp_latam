import { NextRequest, NextResponse } from 'next/server'
import { AccountRmaStatus } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { parseEvidenceUrls, RMA_REASON_LABELS, RMA_STATUS_LABELS } from '@/lib/rma'

const ROLES = ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER', 'DELIVERER', 'COMMERCIAL'] as const

export async function GET(req: NextRequest) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') as AccountRmaStatus | null
  const take = Math.min(120, Math.max(10, Number(searchParams.get('limit') || '60')))

  const where = status && Object.values(AccountRmaStatus).includes(status) ? { status } : {}

  const [items, total, reasonGroups] = await Promise.all([
    prisma.accountReplacementRequest.findMany({
      where,
      orderBy: { openedAt: 'desc' },
      take,
      include: {
        client: { include: { user: { select: { name: true, email: true } } } },
        originalAccount: {
          select: {
            id: true,
            platform: true,
            googleAdsCustomerId: true,
            status: true,
            deliveredAt: true,
          },
        },
        replacementAccount: {
          select: { id: true, googleAdsCustomerId: true, status: true },
        },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.accountReplacementRequest.count({ where }),
    prisma.accountReplacementRequest.groupBy({
      by: ['reason'],
      _count: { _all: true },
    }),
  ])

  const sortedReasons = [...reasonGroups].sort((a, b) => b._count._all - a._count._all)
  const reasonTotal = sortedReasons.reduce((s, g) => s + g._count._all, 0)
  const topReasons = sortedReasons.slice(0, 3).map((g) => ({
    reason: g.reason,
    label: RMA_REASON_LABELS[g.reason],
    count: g._count._all,
    percent: reasonTotal ? Math.round((g._count._all / reasonTotal) * 100) : 0,
  }))

  const openCount = await prisma.accountReplacementRequest.count({
    where: { status: { in: ['EM_ANALISE', 'EM_REPOSICAO'] } },
  })

  const itemsParsed = items.map((row) => ({
    ...row,
    evidenceUrls: parseEvidenceUrls(row.evidenceUrls),
  }))

  return NextResponse.json({
    items: itemsParsed,
    total,
    openCount,
    topReasons,
    labels: { reasons: RMA_REASON_LABELS, statuses: RMA_STATUS_LABELS },
  })
}
