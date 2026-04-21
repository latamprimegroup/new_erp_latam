import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { financeAudit } from '@/lib/finance-audit'
import { getPaginationParams, paginatedResponse } from '@/lib/pagination'
import { getAuthenticatedKey, withRateLimit } from '@/lib/rate-limit-api'
import { COST_CENTERS } from '@/lib/finance-cost-centers'

const createSchema = z.object({
  type:        z.enum(['INCOME', 'EXPENSE']),
  category:    z.string().min(1),
  costCenter:  z.string().optional(),
  value:       z.number().positive(),
  dueDate:     z.string().datetime().optional(),
  paymentDate: z.string().datetime().optional(),
  entryStatus: z.enum(['PENDING', 'PAID', 'CANCELED', 'OVERDUE']).optional(),
  paymentMethod: z.string().optional(),
  walletId:    z.string().optional(),
  orderId:     z.string().optional(),
  netProfit:   z.number().optional(),
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
  const month      = searchParams.get('month')      || String(new Date().getMonth() + 1)
  const year       = searchParams.get('year')       || String(new Date().getFullYear())
  const costCenter = searchParams.get('costCenter') || undefined
  const type       = searchParams.get('type')       || undefined       // INCOME | EXPENSE
  const entryStatus = searchParams.get('entryStatus') || undefined     // PENDING | PAID | etc.
  const category   = searchParams.get('category')   || undefined
  const { page, limit, skip } = getPaginationParams(searchParams)

  const start = new Date(parseInt(year), parseInt(month) - 1, 1)
  const end   = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59)

  const where: Record<string, unknown> = { date: { gte: start, lte: end } }
  if (costCenter)  where.costCenter  = costCenter
  if (type)        where.type        = type
  if (entryStatus) where.entryStatus = entryStatus
  if (category)    where.category    = { contains: category }

  const [entries, total, reconciledInPeriod] = await Promise.all([
    prisma.financialEntry.findMany({
      where,
      include: {
        order:             { select: { id: true } },
        financialCategory: { select: { name: true } },
        wallet:            { select: { name: true, icon: true } },
      },
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

  // Agrupamento por centro de custo (DRE por CC)
  const byCostCenter = await prisma.financialEntry.groupBy({
    by: ['costCenter', 'type'],
    where,
    _sum: { value: true },
    orderBy: { _sum: { value: 'desc' } },
  })

  const income  = totals.find((t) => t.type === 'INCOME')?._sum.value  ?? 0
  const expense = totals.find((t) => t.type === 'EXPENSE')?._sum.value ?? 0

  const paginated = paginatedResponse(entries, total, page, limit)
  return NextResponse.json({
    ...paginated,
    entries:      paginated.items,
    costCenters:  COST_CENTERS,
    byCostCenter,
    flow: {
      income:          Number(income),
      expense:         Number(expense),
      balance:         Number(income) - Number(expense),
      reconciledCount: reconciledInPeriod,
      entryCount:      total,
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
        type:          data.type,
        category:      data.category,
        costCenter:    data.costCenter    || null,
        value:         data.value,
        date:          new Date(),
        dueDate:       data.dueDate       ? new Date(data.dueDate) : null,
        paymentDate:   data.paymentDate   ? new Date(data.paymentDate) : null,
        entryStatus:   data.entryStatus   ?? 'PAID',
        paymentMethod: (data.paymentMethod as import('@prisma/client').FinPaymentMethod | null | undefined) ?? null,
        walletId:      data.walletId      || null,
        orderId:       data.orderId       || null,
        netProfit:     data.netProfit     ?? null,
        description:   data.description   || null,
      },
    })

    // Auditoria financeira com IP
    await financeAudit(req, {
      userId:   session.user?.id,
      action:   'create_entry',
      entity:   'FinancialEntry',
      entityId: entry.id,
      details:  { type: data.type, value: data.value, category: data.category, costCenter: data.costCenter },
    })

    // Compatibilidade com audit genérico
    await audit({
      userId:   session.user?.id,
      action:   'financial_entry_created',
      entity:   'FinancialEntry',
      entityId: entry.id,
      details:  { type: data.type, value: data.value },
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
