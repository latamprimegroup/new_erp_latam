import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getMonthlyWindowUtc } from '@/lib/incentive-engine'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  if (!['COMMERCIAL', 'ADMIN'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const month = parseInt(searchParams.get('month') || `${new Date().getMonth() + 1}`, 10)
  const year = parseInt(searchParams.get('year') || `${new Date().getFullYear()}`, 10)
  const sellerId =
    session.user.role === 'ADMIN'
      ? (searchParams.get('sellerId') || session.user.id)
      : session.user.id

  const { start, end } = getMonthlyWindowUtc(year, month)

  const [orders, quick] = await Promise.all([
    prisma.order.findMany({
      where: {
        sellerId,
        paidAt: { gte: start, lte: end },
        status: { in: ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] },
      },
      orderBy: { paidAt: 'desc' },
      select: {
        id: true,
        paidAt: true,
        value: true,
        sellerCommission: true,
        managerCommission: true,
        netProfit: true,
        sellerMetaUnlocked: true,
        product: true,
      },
    }),
    prisma.quickSaleCheckout.findMany({
      where: {
        sellerId,
        paidAt: { gte: start, lte: end },
        status: 'PAID',
      },
      orderBy: { paidAt: 'desc' },
      include: { listing: { select: { title: true } } },
    }),
  ])

  const extrato = [
    ...orders.map((o) => ({
      type: 'ORDER',
      id: o.id,
      paidAt: o.paidAt,
      product: o.product,
      gross: Number(o.value),
      sellerCommission: Number(o.sellerCommission ?? 0),
      managerCommission: Number(o.managerCommission ?? 0),
      netProfit: Number(o.netProfit ?? 0),
      metaUnlocked: o.sellerMetaUnlocked ?? false,
    })),
    ...quick.map((q) => ({
      type: 'QUICK_SALE',
      id: q.id,
      paidAt: q.paidAt,
      product: q.listing.title,
      gross: Number(q.totalAmount),
      sellerCommission: Number(q.sellerCommission ?? 0),
      managerCommission: Number(q.managerCommission ?? 0),
      netProfit: Number(q.netProfit ?? 0),
      metaUnlocked: q.sellerMetaUnlocked ?? false,
    })),
  ].sort((a, b) => {
    const ta = a.paidAt ? new Date(a.paidAt).getTime() : 0
    const tb = b.paidAt ? new Date(b.paidAt).getTime() : 0
    return tb - ta
  })

  const summary = {
    gross: extrato.reduce((s, e) => s + e.gross, 0),
    sellerCommission: extrato.reduce((s, e) => s + e.sellerCommission, 0),
    managerCommission: extrato.reduce((s, e) => s + e.managerCommission, 0),
    netProfit: extrato.reduce((s, e) => s + e.netProfit, 0),
    totalSales: extrato.length,
  }

  return NextResponse.json({
    month,
    year,
    sellerId,
    summary,
    extrato,
  })
}

