import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { RMA_REASON_LABELS, RMA_ACTION_LABELS } from '@/lib/rma'

const ROLES = ['ADMIN', 'PRODUCTION_MANAGER'] as const

export async function GET(req: NextRequest) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const periodDays = Number(searchParams.get('days') || '90')
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000)

  // ── Mês atual e anterior ──────────────────────────────────────────────────
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

  const [
    totalRmas,
    totalOrders,
    byReason,
    byAction,
    byStatus,
    recentRmas,
    avgResolutionRaw,
    thisMonthRmas,
    lastMonthRmas,
    thisMonthResolved,
    lastMonthResolved,
    monthlyBreakdown,
  ] = await Promise.all([
    prisma.accountReplacementRequest.count({ where: { createdAt: { gte: since } } }),
    prisma.order.count({ where: { createdAt: { gte: since }, status: { not: 'CANCELLED' } } }),
    prisma.accountReplacementRequest.groupBy({
      by: ['reason'],
      _count: { _all: true },
      where: { createdAt: { gte: since } },
    }),
    prisma.accountReplacementRequest.groupBy({
      by: ['actionTaken'],
      _count: { _all: true },
      where: { createdAt: { gte: since } },
    }),
    prisma.accountReplacementRequest.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.accountReplacementRequest.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        abuseFlag: true,
        clientId: true,
        actionTaken: true,
        originalAccount: {
          select: {
            platform: true,
            type: true,
            productionG2: {
              select: { creator: { select: { id: true, name: true, email: true } } },
            },
          },
        },
      },
      take: 500,
    }),
    prisma.accountReplacementRequest.aggregate({
      _avg: { resolutionMinutes: true },
      where: { createdAt: { gte: since }, resolutionMinutes: { not: null } },
    }),
    // Este mês
    prisma.accountReplacementRequest.count({ where: { createdAt: { gte: startOfMonth } } }),
    // Mês passado
    prisma.accountReplacementRequest.count({
      where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
    }),
    // Resolvidas este mês
    prisma.accountReplacementRequest.count({
      where: {
        resolvedAt: { gte: startOfMonth },
        status: { in: ['CONCLUIDO', 'NEGADO_TERMO'] },
      },
    }),
    // Resolvidas mês passado
    prisma.accountReplacementRequest.count({
      where: {
        resolvedAt: { gte: startOfLastMonth, lte: endOfLastMonth },
        status: { in: ['CONCLUIDO', 'NEGADO_TERMO'] },
      },
    }),
    // Últimos 6 meses com breakdown por ação
    prisma.$queryRaw<{ month: string; total: number; reposicoes: number; negados: number }[]>`
      SELECT
        DATE_FORMAT(opened_at, '%Y-%m') AS month,
        COUNT(*) AS total,
        SUM(CASE WHEN action_taken = 'REPOSICAO_EFETUADA' THEN 1 ELSE 0 END) AS reposicoes,
        SUM(CASE WHEN action_taken = 'GARANTIA_NEGADA' THEN 1 ELSE 0 END) AS negados
      FROM tb_reposicoes
      WHERE opened_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(opened_at, '%Y-%m')
      ORDER BY month ASC
    `,
  ])

  // ── Taxa geral ───────────────────────────────────────────────────────────
  const replacementRate =
    totalOrders > 0 ? Math.round((totalRmas / totalOrders) * 100 * 10) / 10 : 0

  // ── Motivos ──────────────────────────────────────────────────────────────
  const reasonTotal = byReason.reduce((s, r) => s + r._count._all, 0)
  const topReasons = [...byReason]
    .sort((a, b) => b._count._all - a._count._all)
    .map((r) => ({
      reason: r.reason,
      label: RMA_REASON_LABELS[r.reason] ?? String(r.reason),
      count: r._count._all,
      percent: reasonTotal ? Math.round((r._count._all / reasonTotal) * 100) : 0,
    }))

  // ── Ações ────────────────────────────────────────────────────────────────
  const actionStats = byAction.map((a) => ({
    action: a.actionTaken,
    label: RMA_ACTION_LABELS[a.actionTaken] ?? String(a.actionTaken),
    count: a._count._all,
  }))

  // ── Status ───────────────────────────────────────────────────────────────
  const statusStats = byStatus.map((s) => ({
    status: s.status,
    count: s._count._all,
  }))

  // ── Por plataforma / tipo de ativo ────────────────────────────────────────
  const platformMap = new Map<string, number>()
  const typeMap = new Map<string, number>()
  for (const rma of recentRmas) {
    const plat = rma.originalAccount?.platform ?? 'UNKNOWN'
    const type = rma.originalAccount?.type ?? 'OUTRO'
    platformMap.set(plat, (platformMap.get(plat) ?? 0) + 1)
    typeMap.set(type, (typeMap.get(type) ?? 0) + 1)
  }
  const byPlatform = [...platformMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([platform, count]) => ({ platform, count }))

  const byType = [...typeMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }))

  // ── Por produtor (G2 creator) ─────────────────────────────────────────────
  const producerMap = new Map<
    string,
    { id: string; name: string | null; email: string; rmas: number }
  >()
  for (const rma of recentRmas) {
    const creator = rma.originalAccount?.productionG2?.creator
    if (!creator) continue
    const existing = producerMap.get(creator.id)
    if (existing) existing.rmas++
    else producerMap.set(creator.id, { id: creator.id, name: creator.name, email: creator.email, rmas: 1 })
  }
  const byProducer = [...producerMap.values()]
    .sort((a, b) => b.rmas - a.rmas)
    .slice(0, 10)

  // ── Flags de abuso ───────────────────────────────────────────────────────
  const abuseFlagCount = recentRmas.filter((r) => r.abuseFlag).length

  // ── LTV por clientes com mais RMAs ────────────────────────────────────────
  const clientRmaCount = new Map<string, number>()
  for (const rma of recentRmas) {
    clientRmaCount.set(rma.clientId, (clientRmaCount.get(rma.clientId) ?? 0) + 1)
  }

  const topClientIds = [...clientRmaCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([id]) => id)

  const topClients = await prisma.clientProfile.findMany({
    where: { id: { in: topClientIds } },
    select: {
      id: true,
      user: { select: { name: true, email: true } },
      orders: { where: { status: { not: 'CANCELLED' } }, select: { value: true } },
      accountReplacementRequests: {
        where: { createdAt: { gte: since } },
        select: { id: true },
      },
    },
  })

  const ltvData = topClients.map((c) => {
    const grossLtv = c.orders.reduce((s, o) => s + Number(o.value ?? 0), 0)
    const rmaCount = c.accountReplacementRequests.length
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
    period: `${periodDays}d`,
    totalRmas,
    totalOrders,
    replacementRate,
    avgResolutionMinutes: Math.round(avgResolutionRaw._avg.resolutionMinutes ?? 0),
    // Mês atual vs anterior
    thisMonth: { total: thisMonthRmas, resolved: thisMonthResolved },
    lastMonth: { total: lastMonthRmas, resolved: lastMonthResolved },
    monthlyChange: lastMonthRmas > 0
      ? Math.round(((thisMonthRmas - lastMonthRmas) / lastMonthRmas) * 100)
      : null,
    // Séries mensais (últimos 6 meses)
    monthlyBreakdown: monthlyBreakdown.map((row) => ({
      month: String(row.month),
      total: Number(row.total),
      reposicoes: Number(row.reposicoes),
      negados: Number(row.negados),
    })),
    topReasons,
    actionStats,
    statusStats,
    byPlatform,
    byType,
    byProducer,
    ltvData,
    abuseFlagCount,
  })
}
