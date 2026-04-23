import { NextRequest, NextResponse } from 'next/server'
import { AccountRmaReason, AccountRmaStatus } from '@prisma/client'
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

export async function POST(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  const body = await req.json()
  const { clientId, originalAccountId, reason, reasonDetail, warrantyHours } = body

  if (!clientId || !originalAccountId || !reason) {
    return NextResponse.json({ error: 'clientId, originalAccountId e reason são obrigatórios' }, { status: 400 })
  }

  if (!Object.values(AccountRmaReason).includes(reason as AccountRmaReason)) {
    return NextResponse.json({ error: 'Motivo inválido' }, { status: 400 })
  }

  const [client, account] = await Promise.all([
    prisma.clientProfile.findUnique({ where: { id: clientId } }),
    prisma.stockAccount.findUnique({ where: { id: originalAccountId } }),
  ])

  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  if (!account) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })

  const rma = await prisma.accountReplacementRequest.create({
    data: {
      clientId,
      originalAccountId,
      reason: reason as AccountRmaReason,
      reasonDetail: reasonDetail || null,
      warrantyHours: warrantyHours ? Number(warrantyHours) : null,
      status: 'EM_ANALISE',
      actionTaken: 'AGUARDANDO',
    },
    include: {
      client: { include: { user: { select: { name: true, email: true } } } },
      originalAccount: { select: { id: true, googleAdsCustomerId: true, platform: true, deliveredAt: true } },
    },
  })

  return NextResponse.json(rma, { status: 201 })
}
