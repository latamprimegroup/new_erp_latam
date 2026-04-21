import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED = ['ADMIN', 'FINANCE']

const createSchema = z.object({
  name:        z.string().min(2).max(120),
  bankName:    z.string().max(100).optional(),
  accountType: z.enum(['CHECKING', 'SAVINGS', 'DIGITAL', 'CREDIT', 'CRIPTO']).default('CHECKING'),
  currency:    z.string().max(10).default('BRL'),
  balance:     z.number().default(0),
  icon:        z.string().max(10).optional(),
  color:       z.string().max(20).optional(),
  notes:       z.string().max(500).optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const wallets = await prisma.finWallet.findMany({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
    include: {
      _count: { select: { entries: true } },
    },
  })

  const totalBalance = wallets.reduce((sum, w) => sum + Number(w.balance), 0)

  return NextResponse.json({ wallets, totalBalance })
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

  const wallet = await prisma.finWallet.create({ data: parsed.data })
  return NextResponse.json(wallet, { status: 201 })
}
