import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { RMA_REASON_LABELS, RMA_ACTION_LABELS } from '@/lib/rma'

const ROLES = ['ADMIN', 'PRODUCTION_MANAGER'] as const

export async function GET() {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const since90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  const [
    totalRmas,
    totalOrders,
    byReason,
    byAction,
    byStatus,
    recentRmas,
    clientAbuse,
    avgResolutionRaw,
  ] = await Promise.all([
    // Total de RMAs nos últimos 90 dias
    prisma.accountReplacementRequest.count({
      where: { createdAt: { gte: since90d } },
    }),

    // Total de pedidos (para calcular taxa geral)
    prisma.order.count({
      where: { createdAt: { gte: since90d }, status: { not: 'CANCELLED' } },
    }),

    // Agrupamento por motivo
    prisma.accountReplacementRequest.groupBy({
      by: ['reason'],
      _count: { _all: true },
      where: { createdAt: { gte: since90d } },
    }),

    // Agrupamento por ação tomada
    prisma.accountReplacementRequest.groupBy({
      by: ['actionTaken'],
      _count: { _all: true },
      where: { createdAt: { gte: since90d } },
    }),

    // Agrupamento por status
    prisma.accountReplacementRequest.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),

    // RMAs recentes com dados de conta original (para calcular por produtor)
    prisma.accountReplacementRequest.findMany({
      where: { createdAt: { gte: since90d } },
      select: {
        id: true,
        reason: true,
        actionTaken: true,
        status: true,
        openedAt: true,
        resolvedAt: true,
        resolutionMinutes: true,
        abuseFlag: true,
        originalAccount: {
          select: {
            id: true,
            googleAdsCustomerId: true,
            productionG2: {
              select: {
                creatorId: true,
                creator: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
        client: {
          select: {
            id: true,
            user: { select: { id: true, name: true, email: true } },
            orders: {
              where: { createdAt: { gte: since90d }, status: { not: 'CANCELLED' } },
              select: { id: true, totalAmount: true },
            },
          },
        },
      },
      orderBy: { openedAt: 'desc' },
      take: 500,
    }),

    // Clientes com maior proporção de RMA / pedidos (abuso)
    prisma.accountReplacementRequest.groupBy({
      by: ['clientId'],
      _count: { _all: true },
      where: { createdAt: { gte: since90d } },
      having: { clientId: { _count: { gte: 2 } } },
      orderBy: { _count: { clientId: 'desc' } },
    }),

    // Tempo médio de resolução
    prisma.accountReplacementRequest.aggregate({
      _avg: { resolutionMinutes: true },
      where: {
        createdAt: { gte: since90d },
        resolutionMinutes: { not: null },
      },
    }),
  ])

  // ── Taxa geral de reposição ───────────────────────────────────────────────
  const replacementRate =
    totalOrders > 0 ? Math.round((totalRmas / totalOrders) * 100 * 10) / 10 : 0

  // ── Motivos (sorted) ─────────────────────────────────────────────────────
  const reasonTotal = byReason.reduce((s, r) => s + r._count._all, 0)
  const topReasons = [...byReason]
    .sort((a, b) => b._count._all - a._count._all)
    .map((r) => ({
      reason: r.reason,
      label: RMA_REASON_LABELS[r.reason] ?? r.reason,
      count: r._count._all,
      percent: reasonTotal ? Math.round((r._count._all / reasonTotal) * 100) : 0,
    }))

  // ── Ações tomadas ─────────────────────────────────────────────────────────
  const actionStats = byAction.map((a) => ({
    action: a.actionTaken,
    label: RMA_ACTION_LABELS[a.actionTaken] ?? a.actionTaken,
    count: a._count._all,
  }))

  // ── Por status ────────────────────────────────────────────────────────────
  const statusStats = byStatus.map((s) => ({
    status: s.status,
    count: s._count._all,
  }))

  // ── Por produtor (G2 creator) ─────────────────────────────────────────────
  const producerMap = new Map<
    string,
    { id: string; name: string | null; email: string; rmas: number }
  >()
  for (const rma of recentRmas) {
    const creator = rma.originalAccount?.productionG2?.creator
    if (!creator) continue
    const existing = producerMap.get(creator.id)
    if (existing) {
      existing.rmas++
    } else {
      producerMap.set(creator.id, {
        id: creator.id,
        name: creator.name,
        email: creator.email,
        rmas: 1,
      })
    }
  }
  const byProducer = [...producerMap.values()]
    .sort((a, b) => b.rmas - a.rmas)
    .slice(0, 10)

  // ── LTV ajustado por cliente ──────────────────────────────────────────────
  // LTV bruto = soma dos pedidos; custo RMA estimado em R$ 0 (não temos preço unitário aqui)
  // Agrupamos RMAs por cliente
  const clientRmaCount = new Map<string, number>()
  for (const rma of recentRmas) {
    const cid = rma.client.id
    clientRmaCount.set(cid, (clientRmaCount.get(cid) ?? 0) + 1)
  }

  // Clientes top por volume de RMA
  const abuseClientIds = clientAbuse.slice(0, 20).map((c) => c.clientId)
  const abuseClients = await prisma.clientProfile.findMany({
    where: { id: { in: abuseClientIds } },
    select: {
      id: true,
      user: { select: { name: true, email: true } },
      orders: {
        where: { status: { not: 'CANCELLED' } },
        select: { totalAmount: true },
      },
      replacementRequests: {
        where: { createdAt: { gte: since90d } },
        select: { id: true, actionTaken: true },
      },
    },
  })

  const ltvData = abuseClients.map((c) => {
    const grossLtv = c.orders.reduce(
      (s, o) => s + Number(o.totalAmount ?? 0),
      0
    )
    const rmaCount = c.replacementRequests.length
    const orderCount = c.orders.length
    const rmaRate = orderCount > 0 ? (rmaCount / orderCount) * 100 : 0
    return {
      clientId: c.id,
      name: c.user?.name || c.user?.email || c.id,
      grossLtv,
      rmaCount,
      orderCount,
      rmaRate: Math.round(rmaRate * 10) / 10,
      isAbuse: rmaRate > 30,
    }
  }).sort((a, b) => b.rmaCount - a.rmaCount)

  return NextResponse.json({
    period: '90d',
    totalRmas,
    totalOrders,
    replacementRate,
    avgResolutionMinutes: Math.round(avgResolutionRaw._avg.resolutionMinutes ?? 0),
    topReasons,
    actionStats,
    statusStats,
    byProducer,
    ltvData,
    abuseFlagCount: recentRmas.filter((r) => r.abuseFlag).length,
  })
}
