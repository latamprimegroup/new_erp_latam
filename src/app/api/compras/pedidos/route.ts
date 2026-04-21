/**
 * GET  /api/compras/pedidos — Lista ordens de compra com alerta de pagamento pendente
 * POST /api/compras/pedidos — Cria ordem de compra
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { COMPRAS_WRITE_ROLES } from '@/lib/asset-privacy'

const READ = ['ADMIN', 'PURCHASING', 'FINANCE']

const createSchema = z.object({
  vendorId:    z.string().min(1),
  totalAmount: z.number().positive(),
  paymentDue:  z.string().datetime().optional(),
  notes:       z.string().max(2000).optional(),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !READ.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status   = searchParams.get('status')
  const vendorId = searchParams.get('vendorId')
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit    = 20

  const where: Record<string, unknown> = {}
  if (status)   where.status   = status
  if (vendorId) where.vendorId = vendorId

  const [orders, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
      include: {
        vendor: { select: { id: true, name: true, category: true, rating: true } },
        _count: { select: { assets: true } },
      },
    }),
    prisma.purchaseOrder.count({ where }),
  ])

  // Alertas de pagamento vencido
  const overdueCount = await prisma.purchaseOrder.count({
    where: { status: 'PENDING', paymentDue: { lt: new Date() } },
  })

  return NextResponse.json({ orders, total, page, pages: Math.ceil(total / limit), overdueCount })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !COMPRAS_WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const vendor = await prisma.vendor.findUnique({ where: { id: parsed.data.vendorId } })
  if (!vendor) return NextResponse.json({ error: 'Fornecedor não encontrado' }, { status: 404 })

  const order = await prisma.purchaseOrder.create({
    data: {
      vendorId:    parsed.data.vendorId,
      totalAmount: parsed.data.totalAmount,
      paymentDue:  parsed.data.paymentDue ? new Date(parsed.data.paymentDue) : undefined,
      notes:       parsed.data.notes,
      createdBy:   session.user.id,
    },
    include: { vendor: { select: { name: true } } },
  })

  return NextResponse.json(order, { status: 201 })
}
