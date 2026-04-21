/**
 * GET  /api/vendas/ativos/orders — Lista ordens de serviço de ativos
 * POST /api/vendas/ativos/orders — Cria nova OS
 *
 * Regras de negócio:
 * - Se negotiatedPrice < floorPrice → status = PENDING_APPROVAL (notifica ADMIN)
 * - Se negotiatedPrice >= floorPrice → status = AWAITING_PAYMENT
 * - Snapshot imutável de costPrice e floorPrice no momento da criação
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'

const READ  = ['ADMIN', 'PURCHASING', 'COMMERCIAL', 'FINANCE', 'DELIVERER']
const WRITE = ['ADMIN', 'COMMERCIAL']

const createSchema = z.object({
  assetId:        z.string().min(1),   // pode ser adsId ou id interno
  negotiatedPrice: z.number().positive(),
  clientName:     z.string().max(200).optional(),
  clientContact:  z.string().max(200).optional(),
  clientId:       z.string().optional(),
  notes:          z.string().max(2000).optional(),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !READ.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status   = searchParams.get('status')
  const sellerId = searchParams.get('sellerId')
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit    = 25

  const hasSensitive = session.user.role === 'ADMIN' || session.user.role === 'FINANCE' || session.user.role === 'PURCHASING'

  const where: Record<string, unknown> = {}
  if (status)   where.status   = status
  // Comercial vê apenas as próprias ordens
  if (session.user.role === 'COMMERCIAL') where.sellerId = session.user.id
  else if (sellerId)                      where.sellerId = sellerId

  const [orders, total] = await Promise.all([
    prisma.assetSalesOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
      include: {
        asset:  { select: { adsId: true, category: true, displayName: true, subCategory: true, status: true } },
        seller: { select: { name: true, email: true } },
      },
    }),
    prisma.assetSalesOrder.count({ where }),
  ])

  // Mascarar costSnapshot e floorSnapshot para COMMERCIAL
  const masked = orders.map((o) => {
    const base = {
      ...o,
      negotiatedPrice: Number(o.negotiatedPrice),
      grossMargin:     Number(o.grossMargin),
      grossMarginPct:  Number(o.grossMarginPct),
    }
    if (!hasSensitive) {
      const { costSnapshot: _c, floorSnapshot: _f, ...rest } = base as typeof base & { costSnapshot?: unknown; floorSnapshot?: unknown }
      void _c; void _f
      return rest
    }
    return { ...base, costSnapshot: Number(o.costSnapshot), floorSnapshot: Number(o.floorSnapshot) }
  })

  // Contadores de status para dashboard
  const byStatus = await prisma.assetSalesOrder.groupBy({ by: ['status'], _count: true })

  return NextResponse.json({ orders: masked, total, page, pages: Math.ceil(total / limit), byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count])) })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !WRITE.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const { assetId, negotiatedPrice, clientName, clientContact, clientId, notes } = parsed.data

  // Busca ativo pelo adsId ou id
  const asset = await prisma.asset.findFirst({
    where: { OR: [{ id: assetId }, { adsId: assetId }] },
  })
  if (!asset) return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 })
  if (asset.status !== 'AVAILABLE')
    return NextResponse.json({ error: `Ativo não disponível (status: ${asset.status})` }, { status: 409 })

  const costSnapshot  = Number(asset.costPrice)
  const floorSnapshot = asset.floorPrice ? Number(asset.floorPrice) : Number(asset.costPrice) * 1.15
  const belowFloor    = negotiatedPrice < floorSnapshot
  const grossMargin   = negotiatedPrice - costSnapshot
  const grossMarginPct = costSnapshot > 0 ? (grossMargin / negotiatedPrice) * 100 : 0

  const initialStatus = belowFloor ? 'PENDING_APPROVAL' : 'AWAITING_PAYMENT'

  const order = await prisma.assetSalesOrder.create({
    data: {
      assetId:         asset.id,
      sellerId:        session.user.id,
      negotiatedPrice,
      costSnapshot,
      floorSnapshot,
      belowFloor,
      grossMargin,
      grossMarginPct,
      status:          initialStatus,
      clientName,
      clientContact,
      clientId,
      notes,
    },
    include: {
      asset:  { select: { adsId: true, displayName: true, category: true } },
      seller: { select: { name: true, email: true } },
    },
  })

  // Registra primeiro movimento
  await prisma.assetSalesOrderMovement.create({
    data: { orderId: order.id, toStatus: initialStatus, notes: 'OS criada', userId: session.user.id },
  })

  // Bloqueia o ativo enquanto a OS está em andamento
  await prisma.asset.update({ where: { id: asset.id }, data: { status: 'SOLD' } })

  // Notifica se preço abaixo do piso
  if (belowFloor) {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
    await Promise.all(admins.map((a) =>
      notify({
        userId:  a.id,
        title:   '⚠️ Preço Abaixo do Piso — Aprovação Necessária',
        message: `OS ${order.id.slice(-8)} por ${session.user.email} | Ativo ${(order.asset as { adsId: string }).adsId} | Preço: R$ ${negotiatedPrice} | Piso: R$ ${floorSnapshot.toFixed(2)}`,
        link:    `/dashboard/compras?tab=orders`,
      })
    ))
  }

  return NextResponse.json(order, { status: 201 })
}
