/**
 * GET /api/admin/vendas-aprovadas
 * Lista QuickSaleCheckouts PAID para gestão de entrega.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'CEO', 'COMMERCIAL', 'DELIVERER'])
  if (!auth.ok) return auth.response

  const { searchParams } = req.nextUrl
  const q      = searchParams.get('q')?.trim().toLowerCase() ?? ''
  const status = searchParams.get('status') ?? ''
  const limit  = Math.min(200, Number.parseInt(searchParams.get('limit') ?? '100', 10))

  const where: Record<string, unknown> = { status: 'PAID' }
  if (status) where.deliveryFlowStatus = status
  if (q) {
    where.OR = [
      { buyerName:      { contains: q } },
      { buyerWhatsapp:  { contains: q } },
      { buyerEmail:     { contains: q } },
      { buyerCpf:       { contains: q } },
      { listing: { title: { contains: q } } },
    ]
  }

  const orders = await prisma.quickSaleCheckout.findMany({
    where,
    orderBy: { paidAt: 'desc' },
    take: limit,
    select: {
      id:            true,
      paidAt:        true,
      buyerName:     true,
      buyerWhatsapp: true,
      buyerEmail:    true,
      totalAmount:   true,
      qty:           true,
      warrantyEndsAt: true,
      deliveryFlowStatus: true,
      adspowerEmail:      true,
      adspowerProfileReleased: true,
      deliverySent:       true,
      listing: { select: { title: true, slug: true } },
      seller:  { select: { name: true } },
    },
  })

  return NextResponse.json(orders.map((o) => ({
    ...o,
    totalAmount: Number(o.totalAmount),
  })))
}
