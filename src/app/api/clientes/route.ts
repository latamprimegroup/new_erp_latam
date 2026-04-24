import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { allocateNextClientCode } from '@/lib/client-id-sequencial'
import { randomBytes } from 'crypto'

const PAGE_SIZE = 20

// ─── POST — Cadastrar novo cliente ────────────────────────────────────────────

const createSchema = z.object({
  name:                 z.string().min(2).max(200),
  email:                z.string().email().max(255),
  phone:                z.string().max(30).optional().nullable(),
  whatsapp:             z.string().max(30).optional().nullable(),
  taxId:                z.string().max(50).optional().nullable(),
  country:              z.string().max(10).optional().nullable(),
  companyName:          z.string().max(200).optional().nullable(),
  jobTitle:             z.string().max(120).optional().nullable(),
  instagramHandle:      z.string().max(64).optional().nullable(),
  whatsappGroupLink:    z.string().max(512).optional().nullable(),
  operationNiche:       z.string().max(48).optional().nullable(),
  leadAcquisitionSource:z.string().max(64).optional().nullable(),
  clientStatus:         z.enum(['ATIVO', 'INATIVO', 'BLOQUEADO']).default('ATIVO'),
  preferredCurrency:    z.enum(['BRL', 'USD']).default('BRL'),
  commercialNotes:      z.string().max(5000).optional().nullable(),
  segmentationTags:     z.array(z.string().max(32)).max(10).optional(),
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const allowed = ['ADMIN', 'COMMERCIAL']
  if (!session.user?.role || !allowed.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })
  }

  const data = parsed.data

  // Verifica e-mail duplicado
  const existingUser = await prisma.user.findUnique({ where: { email: data.email } })
  if (existingUser) {
    return NextResponse.json({ error: 'Já existe um cadastro com este e-mail.' }, { status: 409 })
  }

  // Verifica CPF/CNPJ duplicado
  if (data.taxId) {
    const cleanTaxId = data.taxId.replace(/\D/g, '')
    if (cleanTaxId.length > 0) {
      const existingProfile = await prisma.clientProfile.findFirst({
        where: { taxId: { contains: cleanTaxId } },
      })
      if (existingProfile) {
        return NextResponse.json({ error: 'Já existe um cadastro com este CPF/CNPJ.' }, { status: 409 })
      }
    }
  }

  const client = await prisma.$transaction(async (tx) => {
    // Aloca código sequencial
    const clientCode = await allocateNextClientCode(tx)

    // Cria o usuário com senha temporária aleatória
    const tempPassword = randomBytes(16).toString('hex')

    const user = await tx.user.create({
      data: {
        name:         data.name,
        email:        data.email,
        phone:        data.phone ?? null,
        passwordHash: tempPassword,
        role:         'CLIENT',
      },
    })

    // Cria o perfil do cliente
    const profile = await tx.clientProfile.create({
      data: {
        userId:                user.id,
        clientCode,
        clientStatus:          data.clientStatus,
        preferredCurrency:     data.preferredCurrency,
        whatsapp:              data.whatsapp ?? null,
        country:               data.country ?? null,
        taxId:                 data.taxId ?? null,
        companyName:           data.companyName ?? null,
        jobTitle:              data.jobTitle ?? null,
        instagramHandle:       data.instagramHandle ?? null,
        whatsappGroupLink:     data.whatsappGroupLink ?? null,
        operationNiche:        data.operationNiche ?? null,
        leadAcquisitionSource: data.leadAcquisitionSource ?? null,
        commercialNotes:       data.commercialNotes ?? null,
        segmentationTags:      data.segmentationTags ?? [],
        totalAccountsBought:   0,
        refundCount:           0,
        roiCrmStatus:          'LEAD',
        riskBlockCheckout:     false,
      },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, createdAt: true } },
      },
    })

    return profile
  })

  return NextResponse.json(client, { status: 201 })
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'COMMERCIAL', 'DELIVERER', 'PRODUCER', 'PRODUCTION_MANAGER', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const status = searchParams.get('status') ?? ''
  const tag = searchParams.get('tag') ?? ''

  const where: Record<string, unknown> = {}

  if (status) where.clientStatus = status
  // MySQL não suporta has em JSON nativo via Prisma — usamos string_contains no campo serializado
  if (tag) where.segmentationTags = { string_contains: tag }

  if (q.length > 0) {
    const cleanDigits = q.replace(/\D/g, '')
    const orClauses: Record<string, unknown>[] = [
      { user: { name: { contains: q, mode: 'insensitive' } } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
      { companyName: { contains: q, mode: 'insensitive' } },
      { clientCode: { contains: q, mode: 'insensitive' } },
      { whatsapp: { contains: q } },
    ]
    if (cleanDigits.length >= 3) {
      orClauses.push({ taxId: { contains: cleanDigits } })
    }
    where.OR = orClauses
  }

  const [total, clients] = await Promise.all([
    prisma.clientProfile.count({ where }),
    prisma.clientProfile.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, createdAt: true } },
        metrics: {
          select: {
            ltvReal: true,
            ltvProjetado12m: true,
            revenueTotal: true,
            churnRisk: true,
            ticketMedio: true,
            diasSemCompra: true,
          },
        },
        accountManager: { select: { id: true, name: true } },
      },
      orderBy: { user: { name: 'asc' } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ])

  return NextResponse.json({
    clients,
    total,
    page,
    pages: Math.ceil(total / PAGE_SIZE),
  })
}
