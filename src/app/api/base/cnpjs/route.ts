import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const createSchema = z.object({
  cnpj: z.string().min(14),
  razaoSocial: z.string().optional(),
  nomeFantasia: z.string().optional(),
  cnae: z.string().optional(),
  cnaeDescricao: z.string().optional(),
  cnaesSecundarios: z.unknown().optional(),
  status: z.enum(['AVAILABLE', 'DISABLED']).default('AVAILABLE'),
  accountId: z.string().optional(),
  countryId: z.string().optional(),
  nicheId: z.string().optional(),
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

  const cnpjs = await prisma.cnpj.findMany({
    where,
    include: { account: { select: { id: true, platform: true, type: true } } },
    orderBy: { cnpj: 'asc' },
  })

  return NextResponse.json(cnpjs)
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

    const cleanCnpj = data.cnpj.replace(/\D/g, '')
    const existing = await prisma.cnpj.findFirst({ where: { cnpj: { contains: cleanCnpj } } })
    if (existing) return NextResponse.json({ error: 'CNPJ já cadastrado' }, { status: 400 })

    const cnpj = await prisma.cnpj.create({
      data: {
        cnpj: cleanCnpj,
        razaoSocial: data.razaoSocial || null,
        nomeFantasia: data.nomeFantasia || null,
        cnae: data.cnae || null,
        cnaeDescricao: data.cnaeDescricao || null,
        cnaesSecundarios: data.cnaesSecundarios ? JSON.parse(JSON.stringify(data.cnaesSecundarios)) : null,
        status: data.status,
        accountId: data.accountId || null,
        countryId: data.countryId || null,
        nicheId: data.nicheId || null,
        sourceApi: 'manual',
        fetchedAt: new Date(),
      },
    })

    return NextResponse.json(cnpj)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao cadastrar' }, { status: 500 })
  }
}
