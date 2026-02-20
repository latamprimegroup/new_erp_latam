import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encryption'

const createSchema = z.object({
  email: z.string().email(),
  recovery: z.string().optional(),
  passwordHash: z.string().optional(),
  passwordPlain: z.string().optional(),
  status: z.enum(['AVAILABLE', 'DISABLED']).default('AVAILABLE'),
  accountId: z.string().optional(),
  countryId: z.string().optional(),
  supplierId: z.string().optional(),
})

export async function GET(req: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const accountId = searchParams.get('accountId')

  const where: Record<string, unknown> = {}
  if (status) {
    where.status = status === 'active' ? 'AVAILABLE' : status === 'inactive' ? 'DISABLED' : status
  }
  if (accountId) where.accountId = accountId

  const supplierId = searchParams.get('supplierId')
  if (supplierId) where.supplierId = supplierId

  const rows = await prisma.email.findMany({
    where,
    include: {
      account: { select: { id: true, platform: true, type: true } },
      country: { select: { code: true, name: true } },
      batch: { select: { id: true, filename: true, createdAt: true } },
      supplier: { select: { id: true, name: true } },
      productionAccount: {
        select: {
          id: true,
          platform: true,
          type: true,
          status: true,
          createdAt: true,
          producer: { select: { id: true, name: true, email: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  const emails = rows.map((e) => {
    const { passwordPlain, passwordHash, ...rest } = e
    return {
      ...rest,
      passwordPlain: passwordPlain ? '••••••••' : null,
      passwordHash: passwordHash ? '••••••••' : null,
    }
  })
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } })
  return NextResponse.json({ emails, suppliers })
}

export async function POST(req: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const data = createSchema.parse(body)

    const existing = await prisma.email.findUnique({ where: { email: data.email } })
    if (existing) return NextResponse.json({ error: 'E-mail já cadastrado' }, { status: 400 })

    const email = await prisma.email.create({
      data: {
        email: data.email,
        recovery: data.recovery || null,
        passwordHash: data.passwordHash || null,
        passwordPlain: data.passwordPlain ? encrypt(data.passwordPlain) : null,
        status: data.status,
        accountId: data.accountId || null,
        countryId: data.countryId || null,
        supplierId: data.supplierId || null,
      },
    })

    return NextResponse.json(email)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao cadastrar' }, { status: 500 })
  }
}
