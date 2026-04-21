import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED = ['ADMIN', 'PRODUCTION_MANAGER']

const createSchema = z.object({
  title:    z.string().min(3).max(200),
  category: z.enum(['CONTA_PRODUCAO','EMAIL_GMAIL','CNPJ','RG_DOCUMENTO','PROXY','PERFIL_PAGAMENTO','HARDWARE','OUTRO']).optional(),
  notes:    z.string().max(2000).optional(),
  items: z.array(z.object({
    itemName:     z.string().min(1).max(300),
    itemCategory: z.enum(['CONTA_PRODUCAO','EMAIL_GMAIL','CNPJ','RG_DOCUMENTO','PROXY','PERFIL_PAGAMENTO','HARDWARE','OUTRO']),
    systemStock:  z.number().int().min(0),
    unitCost:     z.number().min(0).optional(),
    abcClass:     z.enum(['A','B','C']).optional(),
  })).min(1).max(500),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status   = searchParams.get('status') ?? undefined
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize = 20

  const where = {
    ...(status ? { status: status as 'ABERTO' | 'FINALIZADO' | 'CANCELADO' } : {}),
    ...(session.user.role === 'PRODUCTION_MANAGER' ? { managerId: session.user.id } : {}),
  }

  const [checks, total] = await Promise.all([
    prisma.inventoryCheck.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        manager: { select: { name: true, email: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.inventoryCheck.count({ where }),
  ])

  return NextResponse.json({ checks, total, page, pageSize })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const { title, category, notes, items } = parsed.data

  // Classificação ABC automática se não informada: por systemStock (A = top 20%, B = 30%, C = resto)
  const sortedByStock = [...items].sort((a, b) => b.systemStock - a.systemStock)
  const topA = Math.ceil(sortedByStock.length * 0.2)
  const topB = Math.ceil(sortedByStock.length * 0.5)
  const stockRank = new Map(sortedByStock.map((it, i) => [it.itemName, i < topA ? 'A' : i < topB ? 'B' : 'C']))

  const check = await prisma.inventoryCheck.create({
    data: {
      title,
      category: category ?? null,
      notes: notes ?? null,
      managerId: session.user.id,
      items: {
        create: items.map((it) => ({
          itemName:     it.itemName,
          itemCategory: it.itemCategory,
          systemStock:  it.systemStock,
          unitCost:     it.unitCost ?? null,
          abcClass:     it.abcClass ?? stockRank.get(it.itemName) ?? 'C',
        })),
      },
    },
    include: {
      items: true,
      manager: { select: { name: true, email: true } },
    },
  })

  return NextResponse.json(check, { status: 201 })
}
