import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { getPaginationParams, paginatedResponse } from '@/lib/pagination'
import { getAuthenticatedKey, withRateLimit } from '@/lib/rate-limit-api'

const createSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  category: z.string().min(1),
  costCenter: z.string().optional(),
  value: z.number().positive(),
  orderId: z.string().optional(),
  netProfit: z.number().optional(),
  description: z.string().optional(),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') || String(new Date().getMonth() + 1)
  const year = searchParams.get('year') || String(new Date().getFullYear())
  const { page, limit, skip } = getPaginationParams(searchParams)

  const start = new Date(parseInt(year), parseInt(month) - 1, 1)
  const end = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59)
  const where = { date: { gte: start, lte: end } }

  const [entries, total, reconciledInPeriod] = await Promise.all([
    prisma.financialEntry.findMany({
      where,
      include: { order: { select: { id: true } } },
      orderBy: { date: 'desc' },
      skip,
      take: limit,
    }),
    prisma.financialEntry.count({ where }),
    prisma.financialEntry.count({ where: { ...where, reconciled: true } }),
  ])

  const totals = await prisma.financialEntry.groupBy({
    by: ['type'],
    where,
    _sum: { value: true },
  })

  const income = totals.find((t) => t.type === 'INCOME')?._sum.value ?? 0
  const expense = totals.find((t) => t.type === 'EXPENSE')?._sum.value ?? 0

  const paginated = paginatedResponse(entries, total, page, limit)
  return NextResponse.json({
    ...paginated,
    entries: paginated.items,
    flow: {
      income: Number(income),
      expense: Number(expense),
      balance: Number(income) - Number(expense),
      reconciledCount: reconciledInPeriod,
      entryCount: total,
    },
  })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const limited = withRateLimit(req, getAuthenticatedKey(session.user!.id, 'financeiro:create'), { max: 60, windowMs: 60_000 })
  if (limited) return limited

  const roles = ['ADMIN', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = createSchema.parse(body)

    const entry = await prisma.financialEntry.create({
      data: {
        type: data.type,
        category: data.category,
        costCenter: data.costCenter || null,
        value: data.value,
        date: new Date(),
        orderId: data.orderId || null,
        netProfit: data.netProfit ?? null,
        description: data.description || null,
      },
    })

    await audit({
      userId: session.user?.id,
      action: 'financial_entry_created',
      entity: 'FinancialEntry',
      entityId: entry.id,
      details: { type: data.type, value: data.value },
    })

    return NextResponse.json(entry)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao registrar' }, { status: 500 })
  }
}
