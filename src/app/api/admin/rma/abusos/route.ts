import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const ROLES = ['ADMIN', 'PRODUCTION_MANAGER'] as const

/** Threshold: clientes com RMA / pedidos acima deste % são marcados como abuso */
const ABUSE_THRESHOLD_PCT = 30

export async function GET(req: NextRequest) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const since = new Date(Date.now() - Number(searchParams.get('days') || 90) * 24 * 60 * 60 * 1000)

  // Clientes com pelo menos 2 RMAs no período
  const rmaGroups = await prisma.accountReplacementRequest.groupBy({
    by: ['clientId'],
    _count: { _all: true },
    where: { createdAt: { gte: since } },
    having: { clientId: { _count: { gte: 2 } } },
    orderBy: { _count: { clientId: 'desc' } },
  })

  const clientIds = rmaGroups.map((g) => g.clientId)

  if (clientIds.length === 0) {
    return NextResponse.json({ suspects: [], threshold: ABUSE_THRESHOLD_PCT })
  }

  const clients = await prisma.clientProfile.findMany({
    where: { id: { in: clientIds } },
    select: {
      id: true,
      user: { select: { name: true, email: true, phone: true } },
      orders: {
        where: { status: { not: 'CANCELLED' } },
        select: { id: true, value: true, createdAt: true },
      },
      accountReplacementRequests: {
        where: { createdAt: { gte: since } },
        select: {
          id: true,
          reason: true,
          actionTaken: true,
          status: true,
          abuseFlag: true,
          openedAt: true,
          originalAccount: { select: { googleAdsCustomerId: true } },
        },
      },
    },
  })

  const suspects = clients.map((c) => {
    const rmaCount = c.accountReplacementRequests.length
    const orderCount = c.orders.length
    const rmaRate = orderCount > 0 ? (rmaCount / orderCount) * 100 : 100
    const grossLtv = c.orders.reduce((s, o) => s + Number(o.value ?? 0), 0)
    const alreadyFlagged = c.accountReplacementRequests.some((r) => r.abuseFlag)

    return {
      clientId: c.id,
      name: c.user?.name || c.user?.email || 'Sem nome',
      email: c.user?.email,
      phone: c.user?.phone,
      rmaCount,
      orderCount,
      rmaRate: Math.round(rmaRate * 10) / 10,
      grossLtv,
      isAbuse: rmaRate > ABUSE_THRESHOLD_PCT,
      alreadyFlagged,
      recentRmas: c.accountReplacementRequests.slice(0, 5),
    }
  })
    .filter((s) => s.rmaRate > ABUSE_THRESHOLD_PCT)
    .sort((a, b) => b.rmaRate - a.rmaRate)

  return NextResponse.json({ suspects, threshold: ABUSE_THRESHOLD_PCT })
}

/** Marcar/desmarcar flag de abuso em todos os RMAs de um cliente */
export async function POST(req: NextRequest) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { clientId, flag } = await req.json()
  if (!clientId || typeof flag !== 'boolean') {
    return NextResponse.json({ error: 'clientId e flag (boolean) são obrigatórios' }, { status: 400 })
  }

  const { count } = await prisma.accountReplacementRequest.updateMany({
    where: { clientId },
    data: { abuseFlag: flag },
  })

  return NextResponse.json({ ok: true, updated: count })
}
