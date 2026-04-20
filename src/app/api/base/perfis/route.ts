import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const createSchema = z.object({
  type: z.string().min(1),
  gateway: z.string().min(1),
  status: z.enum(['AVAILABLE', 'DISABLED']).default('AVAILABLE'),
  cnpjId: z.string().optional(),
  accountId: z.string().optional(),
  countryId: z.string().optional(),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const accountId = searchParams.get('accountId')

  const where: Record<string, unknown> = {}
  if (status) {
    where.status = status === 'active' ? 'AVAILABLE' : status === 'inactive' ? 'DISABLED' : status
  }
  if (accountId) where.accountId = accountId

  const perfis = await prisma.paymentProfile.findMany({
    where,
    include: {
      cnpj: { select: { id: true, cnpj: true, razaoSocial: true } },
      account: { select: { id: true, platform: true } },
    },
    orderBy: { type: 'asc' },
  })

  return NextResponse.json(perfis)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = createSchema.parse(body)

    const perfil = await prisma.paymentProfile.create({
      data: {
        type: data.type,
        gateway: data.gateway,
        status: data.status,
        cnpjId: data.cnpjId || null,
        accountId: data.accountId || null,
        countryId: data.countryId || null,
      },
    })

    return NextResponse.json(perfil)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao cadastrar' }, { status: 500 })
  }
}
