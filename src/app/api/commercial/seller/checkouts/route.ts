import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    if (!['ADMIN', 'COMMERCIAL'].includes(session.user.role ?? '')) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const statusFilter = (searchParams.get('status') || '').trim().toUpperCase()
    const limit = Math.min(150, Math.max(5, Number(searchParams.get('limit') || 40)))

    // Para COMMERCIAL usa apenas filtro por listing.createdBy para evitar
    // erro se coluna sellerId ainda não existir no banco de produção.
    const where = {
      ...(statusFilter ? { status: statusFilter as 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED' } : {}),
      ...(session.user.role === 'ADMIN'
        ? {}
        : { listing: { createdBy: session.user.id } }),
    }

    const checkouts = await prisma.quickSaleCheckout.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        buyerName: true,
        buyerWhatsapp: true,
        qty: true,
        totalAmount: true,
        pixCopyPaste: true,
        createdAt: true,
        paidAt: true,
        expiresAt: true,
        listing: {
          select: {
            title: true,
            slug: true,
          },
        },
      },
    })

    return NextResponse.json({
      items: checkouts.map((checkout) => ({
        id: checkout.id,
        status: checkout.status,
        buyerName: checkout.buyerName,
        buyerWhatsapp: checkout.buyerWhatsapp,
        qty: checkout.qty,
        totalAmount: Number(checkout.totalAmount),
        pixCopyPaste: checkout.pixCopyPaste,
        createdAt: checkout.createdAt,
        paidAt: checkout.paidAt,
        expiresAt: checkout.expiresAt,
        listing: checkout.listing,
        checkoutUrl: `/loja/${checkout.listing.slug}?checkoutId=${encodeURIComponent(checkout.id)}`,
      })),
    })
  } catch (err) {
    console.error('[seller/checkouts] Erro:', err)
    return NextResponse.json({ error: 'Erro ao carregar histórico', items: [] }, { status: 500 })
  }
}
