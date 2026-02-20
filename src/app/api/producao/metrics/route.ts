import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const producerId = searchParams.get('producerId')
  const period = searchParams.get('period') || 'month' // day | week | month | year
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')

  const isAdmin = session.user?.role === 'ADMIN'
  const filterProducerId = isAdmin && producerId ? producerId : session.user?.id
  if (!filterProducerId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const now = new Date()
  let start: Date
  let end = new Date(now)

  if (dateFrom && dateTo) {
    start = new Date(dateFrom)
    end = new Date(dateTo)
  } else {
    switch (period) {
      case 'day':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      case 'week':
        start = new Date(now)
        start.setDate(start.getDate() - 7)
        break
      case 'year':
        start = new Date(now.getFullYear(), 0, 1)
        break
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1)
    }
  }

  const where = {
    producerId: filterProducerId,
    createdAt: { gte: start, lte: end },
  }

  const [accounts, byReason] = await Promise.all([
    prisma.productionAccount.findMany({
      where,
      select: { status: true, createdAt: true, rejectionReasonCode: true },
    }),
    prisma.productionAccount.groupBy({
      by: ['rejectionReasonCode'],
      where: { ...where, status: 'REJECTED' },
      _count: true,
    }),
  ])

  const total = accounts.length
  const approved = accounts.filter((a) => a.status === 'APPROVED').length
  const rejected = accounts.filter((a) => a.status === 'REJECTED').length
  const taxaSucesso = total > 0 ? Math.round((approved / total) * 100) : 0

  const dailyMap = new Map<string, number>()
  for (const a of accounts) {
    const d = a.createdAt.toISOString().slice(0, 10)
    dailyMap.set(d, (dailyMap.get(d) || 0) + 1)
  }
  const daily = Array.from(dailyMap.entries())
    .map(([data, total]) => ({ data, total }))
    .sort((a, b) => a.data.localeCompare(b.data))

  const porMotivo = byReason
    .map((r) => ({
      motivo: r.rejectionReasonCode || 'Sem código',
      quantidade: r._count,
    }))
    .sort((a, b) => b.quantidade - a.quantidade)

  return NextResponse.json({
    periodo: { start: start.toISOString(), end: end.toISOString() },
    total,
    aprovadas: approved,
    reprovadas: rejected,
    taxaSucesso,
    porMotivo,
    daily,
  })
}
