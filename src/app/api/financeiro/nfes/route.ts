import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED = ['ADMIN', 'FINANCE']

const createSchema = z.object({
  entryId:     z.string().optional(),
  walletId:    z.string().optional(),
  nfeNumber:   z.string().max(50).optional(),
  series:      z.string().max(5).optional(),
  nfeStatus:   z.enum(['PENDENTE', 'EMITIDA', 'CANCELADA', 'ERRO']).default('PENDENTE'),
  issueDate:   z.string().datetime().optional(),
  totalAmount: z.number().positive().optional(),
  serviceDesc: z.string().max(500).optional(),
  clientCnpj:  z.string().max(20).optional(),
  clientName:  z.string().max(200).optional(),
  externalId:  z.string().max(100).optional(),
  pdfUrl:      z.string().url().max(2000).optional(),
  xmlUrl:      z.string().url().max(2000).optional(),
  notes:       z.string().max(500).optional(),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? undefined
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit  = 30

  const [nfes, total] = await Promise.all([
    prisma.finNfe.findMany({
      where: status ? { nfeStatus: status } : {},
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { wallet: { select: { name: true } } },
    }),
    prisma.finNfe.count({ where: status ? { nfeStatus: status } : {} }),
  ])

  return NextResponse.json({ nfes, total, page, limit })
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

  const { issueDate, totalAmount, ...rest } = parsed.data
  const nfe = await prisma.finNfe.create({
    data: {
      ...rest,
      issueDate:   issueDate ? new Date(issueDate) : null,
      totalAmount: totalAmount ?? null,
    },
  })
  return NextResponse.json(nfe, { status: 201 })
}
