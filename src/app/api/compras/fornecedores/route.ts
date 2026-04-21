/**
 * GET  /api/compras/fornecedores — Lista fornecedores (PURCHASING/ADMIN)
 * POST /api/compras/fornecedores — Cria fornecedor
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { COMPRAS_WRITE_ROLES } from '@/lib/asset-privacy'

const READ  = ['ADMIN', 'PURCHASING']

const createSchema = z.object({
  name:         z.string().min(2).max(200),
  taxId:        z.string().max(30).optional(),
  contactInfo:  z.record(z.string()).optional(),
  rating:       z.number().int().min(1).max(10).default(5),
  paymentTerms: z.string().max(200).optional(),
  category:     z.string().min(1).max(50),
  notes:        z.string().max(2000).optional(),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !READ.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const q        = searchParams.get('q')
  const category = searchParams.get('category')
  const active   = searchParams.get('active') !== 'false'
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit    = Math.min(50, parseInt(searchParams.get('limit') ?? '20', 10))

  const where: Record<string, unknown> = { active }
  if (category) where.category = category
  if (q) where.name = { contains: q }

  const [vendors, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      orderBy: [{ rating: 'desc' }, { name: 'asc' }],
      skip:  (page - 1) * limit,
      take:  limit,
      include: {
        _count: { select: { assets: true, purchaseOrders: true } },
      },
    }),
    prisma.vendor.count({ where }),
  ])

  return NextResponse.json({ vendors, total, page, pages: Math.ceil(total / limit) })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !COMPRAS_WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const vendor = await prisma.vendor.create({ data: parsed.data })
  return NextResponse.json(vendor, { status: 201 })
}
