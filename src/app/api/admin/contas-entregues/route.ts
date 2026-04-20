import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const roles = ['ADMIN', 'COMMERCIAL']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const hasCustomerId = searchParams.get('hasCustomerId')

  const base: Prisma.StockAccountWhereInput = {
    clientId: { not: null },
    deletedAt: null,
    platform: 'GOOGLE_ADS',
    OR: [{ status: 'DELIVERED' }, { deliveredAt: { not: null } }],
  }
  if (hasCustomerId === 'true') base.googleAdsCustomerId = { not: null }
  if (hasCustomerId === 'false') base.googleAdsCustomerId = { equals: null }

  const accounts = await prisma.stockAccount.findMany({
    where: base,
    include: {
      client: { include: { user: { select: { name: true, email: true } } } },
      manager: { include: { user: { select: { name: true, email: true } } } },
      supplier: { select: { name: true } },
    },
    orderBy: [{ deliveredAt: 'desc' }, { updatedAt: 'desc' }],
  })

  const accountIds = accounts.map((a) => a.id)
  const rmaRows =
    accountIds.length > 0
      ? await prisma.accountReplacementRequest.groupBy({
          by: ['originalAccountId'],
          where: { originalAccountId: { in: accountIds } },
          _count: { _all: true },
        })
      : []
  const rmaByAccount = Object.fromEntries(rmaRows.map((r) => [r.originalAccountId, r._count._all]))

  const clientSpendGoogle: Record<string, number> = {}
  for (const a of accounts) {
    if (!a.clientId) continue
    const add = Number(a.spent ?? 0)
    clientSpendGoogle[a.clientId] = (clientSpendGoogle[a.clientId] ?? 0) + add
  }

  const accountsWithRma = accounts.map((a) => ({
    ...a,
    rmaHistoryCount: rmaByAccount[a.id] ?? 0,
  }))

  return NextResponse.json({ accounts: accountsWithRma, clientSpendGoogle })
}
