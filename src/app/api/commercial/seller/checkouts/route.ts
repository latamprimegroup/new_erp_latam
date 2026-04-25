import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  checkoutPaymentMethodKey,
  listingPaymentModeKey,
  parseQuickSalePaymentMode,
  type QuickSalePaymentMethod,
} from '@/lib/quick-sale-payments'
import { createInvisibleCheckoutLink } from '@/lib/invisible-checkout'

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
            id: true,
            title: true,
            slug: true,
          },
        },
      },
    })

    const orderKeys = checkouts.map((checkout) => `quick_sale_order_ref:${checkout.id}`)
    const paymentMethodKeys = checkouts.map((checkout) => checkoutPaymentMethodKey(checkout.id))
    const listingModeKeys = checkouts.map((checkout) => listingPaymentModeKey(checkout.listing.id))
    const settings = orderKeys.length > 0
      ? await prisma.systemSetting.findMany({
        where: { key: { in: [...orderKeys, ...paymentMethodKeys, ...listingModeKeys] } },
          select: { key: true, value: true },
        })
      : []
    const orderNumberByCheckoutId = new Map<string, string>()
    const paymentMethodByCheckoutId = new Map<string, QuickSalePaymentMethod>()
    const checkoutModeByListingId = new Map<string, ReturnType<typeof parseQuickSalePaymentMode>>()
    for (const ref of settings) {
      if (!ref.key.startsWith('quick_sale_order_ref:')) continue
      const checkoutId = ref.key.replace('quick_sale_order_ref:', '')
      const orderNumber = ref.value?.trim()
      if (!checkoutId || !orderNumber) continue
      orderNumberByCheckoutId.set(checkoutId, orderNumber)
    }
    for (const setting of settings) {
      if (setting.key.startsWith('quick_sale_checkout_payment_method:')) {
        const checkoutId = setting.key.replace('quick_sale_checkout_payment_method:', '')
        const raw = String(setting.value ?? '').trim().toUpperCase()
        if (!checkoutId) continue
        if (raw === 'KAST' || raw === 'MERCURY' || raw === 'PIX') {
          paymentMethodByCheckoutId.set(checkoutId, raw)
        }
        continue
      }
      if (setting.key.startsWith('quick_sale_listing_payment_mode:')) {
        const listingId = setting.key.replace('quick_sale_listing_payment_mode:', '')
        if (!listingId) continue
        checkoutModeByListingId.set(listingId, parseQuickSalePaymentMode(setting.value))
      }
    }

    const items = await Promise.all(checkouts.map(async (checkout) => {
      const checkoutMode = checkoutModeByListingId.get(checkout.listing.id) ?? 'PIX'
      const legacyUrl =
        checkoutMode === 'GLOBAL'
          ? `/loja-global/${checkout.listing.slug}?checkoutId=${encodeURIComponent(checkout.id)}`
          : `/loja/${checkout.listing.slug}?checkoutId=${encodeURIComponent(checkout.id)}`
      const secure = await createInvisibleCheckoutLink({
        checkoutId: checkout.id,
        listingSlug: checkout.listing.slug,
        mode: checkoutMode,
        ttlMinutes: 15,
        maxUses: 1,
        closeOnPaid: true,
      }).catch(() => null)
      return {
      checkoutMode,
      id: checkout.id,
      orderNumber: orderNumberByCheckoutId.get(checkout.id) ?? null,
      paymentMethod: paymentMethodByCheckoutId.get(checkout.id) ?? 'PIX',
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
      checkoutUrl: secure?.secureUrl ?? legacyUrl,
      secureCheckoutUrl: secure?.secureUrl ?? null,
      secureCheckoutLegacyUrl: secure?.legacyUrl ?? legacyUrl,
      secureCheckoutToken: secure?.token ?? null,
      }
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

    const pendingCount = filteredItems.filter((item) => item.status === 'PENDING').length
    const paidCount = filteredItems.filter((item) => item.status === 'PAID').length
    const expiredCount = filteredItems.filter((item) => item.status === 'EXPIRED').length
    const cancelledCount = filteredItems.filter((item) => item.status === 'CANCELLED').length
    const generatedCount = filteredItems.length
    const conversionPct = generatedCount > 0 ? Math.round((paidCount / generatedCount) * 100) : 0
    const pendingStaleCount = filteredItems.filter((item) => {
      if (item.status !== 'PENDING') return false
      const ageMs = Date.now() - new Date(item.createdAt).getTime()
      return ageMs >= 15 * 60 * 1000
    }).length
    const funnelByListingMap = new Map<string, {
      listingId: string
      slug: string
      title: string
      generated: number
      pending: number
      paid: number
      expired: number
      cancelled: number
    }>()
    for (const item of filteredItems) {
      const existing = funnelByListingMap.get(item.listing.id) ?? {
        listingId: item.listing.id,
        slug: item.listing.slug,
        title: item.listing.title,
        generated: 0,
        pending: 0,
        paid: 0,
        expired: 0,
        cancelled: 0,
      }
      existing.generated += 1
      if (item.status === 'PENDING') existing.pending += 1
      else if (item.status === 'PAID') existing.paid += 1
      else if (item.status === 'EXPIRED') existing.expired += 1
      else if (item.status === 'CANCELLED') existing.cancelled += 1
      funnelByListingMap.set(item.listing.id, existing)
    }
    const byListing = Array.from(funnelByListingMap.values())
      .map((entry) => ({
        ...entry,
        conversionPct: entry.generated > 0 ? Math.round((entry.paid / entry.generated) * 100) : 0,
      }))
      .sort((a, b) => b.generated - a.generated)

    return NextResponse.json({
      items: filteredItems,
      funnel: {
        generated: generatedCount,
        pending: pendingCount,
        paid: paidCount,
        expired: expiredCount,
        cancelled: cancelledCount,
        pendingStale: pendingStaleCount,
        conversionPct,
        byListing,
      },
    })
  } catch (err) {
    console.error('[seller/checkouts] Erro:', err)
    return NextResponse.json({
      error: 'Erro ao carregar histórico',
      items: [],
      funnel: {
        generated: 0,
        pending: 0,
        paid: 0,
        expired: 0,
        cancelled: 0,
        pendingStale: 0,
        conversionPct: 0,
        byListing: [],
      },
    }, { status: 500 })
  }
}
