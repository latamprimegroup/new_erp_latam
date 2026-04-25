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
    const searchQuery = (searchParams.get('q') || searchParams.get('search') || '').trim().toLowerCase()
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
        adspowerEmail: true,
        deliveryFlowStatus: true,
        deliveryStatusNote: true,
        deliveryRequestedAt: true,
        deliverySent: true,
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

    const orderKeys = checkouts.map((checkout) => `quick_sale_order_ref:${checkout.id}`)
    const orderRefs = orderKeys.length > 0
      ? await prisma.systemSetting.findMany({
          where: { key: { in: orderKeys } },
          select: { key: true, value: true },
        })
      : []
    const orderNumberByCheckoutId = new Map<string, string>()
    for (const ref of orderRefs) {
      if (!ref.key.startsWith('quick_sale_order_ref:')) continue
      const checkoutId = ref.key.replace('quick_sale_order_ref:', '')
      const orderNumber = ref.value?.trim()
      if (!checkoutId || !orderNumber) continue
      orderNumberByCheckoutId.set(checkoutId, orderNumber)
    }

    const items = checkouts.map((checkout) => ({
      id: checkout.id,
      orderNumber: orderNumberByCheckoutId.get(checkout.id) ?? null,
      status: checkout.status,
      buyerName: checkout.buyerName,
      buyerWhatsapp: checkout.buyerWhatsapp,
      adspowerEmail: checkout.adspowerEmail,
      deliveryFlowStatus: checkout.deliveryFlowStatus,
      deliveryStatusNote: checkout.deliveryStatusNote,
      deliveryRequestedAt: checkout.deliveryRequestedAt,
      deliverySent: checkout.deliverySent,
      qty: checkout.qty,
      totalAmount: Number(checkout.totalAmount),
      pixCopyPaste: checkout.pixCopyPaste,
      createdAt: checkout.createdAt,
      paidAt: checkout.paidAt,
      expiresAt: checkout.expiresAt,
      listing: checkout.listing,
      checkoutUrl: `/loja/${checkout.listing.slug}?checkoutId=${encodeURIComponent(checkout.id)}`,
    }))

    const filteredItems = searchQuery
      ? items.filter((item) => {
          const haystack = [
            item.id,
            item.orderNumber ?? '',
            item.buyerName,
            item.buyerWhatsapp,
            item.listing.title,
            item.listing.slug,
          ]
            .join(' ')
            .toLowerCase()
          return haystack.includes(searchQuery)
        })
      : items

    return NextResponse.json({
      items: filteredItems,
    })
  } catch (err) {
    console.error('[seller/checkouts] Erro:', err)
    return NextResponse.json({ error: 'Erro ao carregar histórico', items: [] }, { status: 500 })
  }
}
