/**
 * GET  /api/socio/entries — Lista lançamentos pessoais
 * POST /api/socio/entries — Cria lançamento pessoal
 *
 * 100% privado: cada sócio só vê seus próprios dados.
 */
import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z }                from 'zod'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'
import type { SocioCategory, SocioEntryType } from '@prisma/client'

function isAdmin(role?: string | null) {
  return role === 'ADMIN'
}

const createSchema = z.object({
  type:          z.enum(['RECEITA', 'DESPESA']),
  category:      z.enum(['MORADIA','ALIMENTACAO','LAZER','SAUDE','EDUCACAO','TRANSPORTE','INVESTIMENTO_EXTERNO','IMPOSTO_PESSOAL','PRO_LABORE','DISTRIBUICAO_LUCRO','ADIANTAMENTO','REEMBOLSO_EMPRESA','OUTRO']),
  amount:        z.number().positive(),
  currency:      z.string().max(3).default('BRL'),
  date:          z.string(),
  description:   z.string().max(500).optional(),
  paymentMethod: z.string().max(50).optional(),
  externalTxId:  z.string().max(300).optional(),
  aiExtracted:   z.boolean().default(false),
})

export async function GET(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isAdmin(session.user.role))
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const page     = parseInt(searchParams.get('page') ?? '1', 10)
  const limit    = 30
  const type     = searchParams.get('type')     as SocioEntryType | null
  const category = searchParams.get('category') as SocioCategory  | null
  const year     = searchParams.get('year')
  const month    = searchParams.get('month')

  const profile = await prisma.socioProfile.findUnique({ where: { userId: session.user.id }, select: { id: true } })
  if (!profile) return NextResponse.json({ entries: [], total: 0 })

  const where: Record<string, unknown> = { profileId: profile.id }
  if (type)     where.type     = type
  if (category) where.category = category
  if (year && month) {
    const y = parseInt(year, 10); const m = parseInt(month, 10)
    where.date = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) }
  }

  const [entries, total] = await Promise.all([
    prisma.socioEntry.findMany({ where, orderBy: { date: 'desc' }, take: limit, skip: (page - 1) * limit }),
    prisma.socioEntry.count({ where }),
  ])

  // Totais do período
  const aggIncome  = await prisma.socioEntry.aggregate({ where: { ...where, type: 'RECEITA' }, _sum: { amount: true } })
  const aggExpense = await prisma.socioEntry.aggregate({ where: { ...where, type: 'DESPESA' }, _sum: { amount: true } })

  return NextResponse.json({
    entries, total,
    page, pages: Math.ceil(total / limit),
    totals: {
      income:  Number(aggIncome._sum.amount  ?? 0),
      expense: Number(aggExpense._sum.amount ?? 0),
      balance: Number(aggIncome._sum.amount  ?? 0) - Number(aggExpense._sum.amount ?? 0),
    },
  })
}

export async function POST(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isAdmin(session.user.role))
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  // Upsert do perfil
  const profile = await prisma.socioProfile.upsert({
    where:  { userId: session.user.id },
    update: {},
    create: { userId: session.user.id },
  })

  // Anti-duplicata por externalTxId
  if (parsed.data.externalTxId) {
    const dup = await prisma.socioEntry.findFirst({
      where: { profileId: profile.id, externalTxId: parsed.data.externalTxId },
    })
    if (dup) return NextResponse.json({ error: 'Transação já lançada (ID duplicado)', entryId: dup.id }, { status: 409 })
  }

  const entry = await prisma.socioEntry.create({
    data: {
      profileId:     profile.id,
      type:          parsed.data.type      as SocioEntryType,
      category:      parsed.data.category  as SocioCategory,
      amount:        parsed.data.amount,
      currency:      parsed.data.currency,
      date:          new Date(parsed.data.date),
      description:   parsed.data.description,
      paymentMethod: parsed.data.paymentMethod,
      externalTxId:  parsed.data.externalTxId,
      aiExtracted:   parsed.data.aiExtracted,
    },
  })

  return NextResponse.json(entry, { status: 201 })
}
