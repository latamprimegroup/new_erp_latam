import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
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

  const where: { clientId: { not: null }; googleAdsCustomerId?: { equals: null } | { not: null } } = {
    clientId: { not: null },
  }
  if (hasCustomerId === 'true') where.googleAdsCustomerId = { not: null }
  if (hasCustomerId === 'false') where.googleAdsCustomerId = { equals: null }

  const accounts = await prisma.stockAccount.findMany({
    where,
    include: {
      client: { include: { user: { select: { name: true, email: true } } } },
    },
    orderBy: { deliveredAt: 'desc' },
  })

  return NextResponse.json(accounts)
}
