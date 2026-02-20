import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

/**
 * GET - Lista contas aprovadas do dia que ainda não foram conferidas pelo gerente.
 * Produção Account (APPROVED) + Production G2 (APROVADA ou ENVIADA_ESTOQUE) sem validatedAt.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const dateParam = searchParams.get('date') // YYYY-MM-DD
  const date = dateParam ? new Date(dateParam + 'T12:00:00') : new Date()
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0)
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59)

  const [accounts, g2Items] = await Promise.all([
    prisma.productionAccount.findMany({
      where: {
        status: 'APPROVED',
        validatedAt: null,
        deletedAt: null,
        updatedAt: { gte: startOfDay, lte: endOfDay },
      },
      include: { producer: { select: { id: true, name: true, email: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.productionG2.findMany({
      where: {
        status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
        archivedAt: null,
        deletedAt: null,
        validatedAt: null,
        approvedAt: { gte: startOfDay, lte: endOfDay },
      },
      include: { creator: { select: { id: true, name: true, email: true } } },
      orderBy: { approvedAt: 'desc' },
    }),
  ])

  const byProducer: Record<string, { producer: { id: string; name: string | null; email: string }; accounts: typeof accounts; g2Items: typeof g2Items }> = {}

  for (const a of accounts) {
    const key = a.producerId
    if (!byProducer[key]) {
      byProducer[key] = {
        producer: a.producer,
        accounts: [],
        g2Items: [],
      }
    }
    byProducer[key].accounts.push(a)
  }
  for (const g of g2Items) {
    const key = g.creatorId
    if (!byProducer[key]) {
      byProducer[key] = {
        producer: g.creator,
        accounts: [],
        g2Items: [],
      }
    }
    byProducer[key].g2Items.push(g)
  }

  return NextResponse.json({
    date: date.toISOString().slice(0, 10),
    pending: {
      accounts: accounts.length,
      g2Items: g2Items.length,
      total: accounts.length + g2Items.length,
    },
    items: { accounts, g2Items },
    byProducer: Object.values(byProducer).filter((p) => p.accounts.length > 0 || p.g2Items.length > 0),
  })
}
