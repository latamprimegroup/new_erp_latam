import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { isBlockedForPlugPlay, isHighRiskScore } from '@/lib/reputation-engine'

async function num(key: string, fb: number) {
  const s = await prisma.systemSetting.findUnique({ where: { key } })
  if (!s) return fb
  const n = parseFloat(s.value)
  return Number.isFinite(n) ? n : fb
}

function whaleTier(total: number, gold: number, silver: number): 'GOLD' | 'SILVER' | 'BRONZE' {
  if (total >= gold) return 'GOLD'
  if (total >= silver) return 'SILVER'
  return 'BRONZE'
}

/**
 * Carteira comercial — ranking, filtros por inatividade, notas.
 * Query: inactiveMinDays (só clientes sem compra há N+ dias), minSpent, sort=spent|lastPurchase
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const inactiveMinDays = Math.max(0, parseInt(searchParams.get('inactiveMinDays') || '0', 10) || 0)
  const minSpent = Math.max(0, parseFloat(searchParams.get('minSpent') || '0') || 0)
  const sort = searchParams.get('sort') === 'lastPurchase' ? 'lastPurchase' : 'spent'

  const now = new Date()
  const fifteenAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000)
  const sevenAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const [goldMin, silverMin, minSpend7dAlert] = await Promise.all([
    num('commercial_whale_gold_min', 200_000),
    num('commercial_whale_silver_min', 50_000),
    num('commercial_alert_7d_min_spent', 5000),
  ])

  const baseWhere: Prisma.ClientProfileWhereInput = {
    OR: [{ totalSpent: { gt: 0 } }, { orders: { some: {} } }],
  }

  const filters: Prisma.ClientProfileWhereInput[] = []
  if (inactiveMinDays > 0) {
    const cutoff = new Date(now.getTime() - inactiveMinDays * 24 * 60 * 60 * 1000)
    filters.push({
      OR: [{ lastPurchaseAt: null }, { lastPurchaseAt: { lt: cutoff } }],
    })
  }
  if (minSpent > 0) {
    filters.push({ totalSpent: { gte: minSpent } })
  }

  const where: Prisma.ClientProfileWhereInput =
    filters.length > 0 ? { AND: [baseWhere, ...filters] } : baseWhere

  const rows = await prisma.clientProfile.findMany({
    where,
    take: 200,
    orderBy:
      sort === 'lastPurchase'
        ? [{ lastPurchaseAt: 'asc' }, { totalSpent: 'desc' }]
        : { totalSpent: 'desc' },
    include: {
      user: { select: { name: true, email: true, phone: true } },
    },
  })

  const clients = rows.map((c) => {
    const spent = Number(c.totalSpent ?? 0)
    const last = c.lastPurchaseAt
    const inactive15 = !last || last < fifteenAgo
    const alertRisco7d = spent >= minSpend7dAlert && (!last || last < sevenAgo)
    return {
      id: c.id,
      clientCode: c.clientCode,
      name: c.user.name,
      email: c.user.email,
      phone: c.user.phone,
      whatsapp: c.whatsapp,
      totalSpent: spent,
      lastPurchaseAt: last?.toISOString() ?? null,
      whale: whaleTier(spent, goldMin, silverMin),
      alertRepescagem15d: inactive15,
      alertRisco7d,
      commercialNotes: c.commercialNotes,
      lastContactDate: c.lastContactDate?.toISOString() ?? null,
      reputationScore: c.reputationScore ?? null,
      averageAccountLifetimeDays: c.averageAccountLifetimeDays ?? null,
      refundCount: c.refundCount ?? 0,
      nicheTag: c.nicheTag ?? null,
      plugPlayErrorCount: c.plugPlayErrorCount ?? 0,
      plugPlayBlocked:
        isBlockedForPlugPlay(c.plugPlayErrorCount) || isHighRiskScore(c.reputationScore),
    }
  })

  if (sort === 'spent') {
    clients.sort((a, b) => b.totalSpent - a.totalSpent)
  }

  return NextResponse.json({
    thresholds: { goldMin, silverMin, minSpend7dAlert },
    filters: { inactiveMinDays, minSpent, sort },
    clients,
  })
}
