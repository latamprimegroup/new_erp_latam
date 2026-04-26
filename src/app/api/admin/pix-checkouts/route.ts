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
    if (!['ADMIN', 'COMMERCIAL', 'FINANCE'].includes(session.user.role ?? '')) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const statusFilter = (searchParams.get('status') || '').trim().toUpperCase()
    const limit = Math.min(200, Math.max(10, Number(searchParams.get('limit') || 60)))
    const type = searchParams.get('type') || 'all' // 'all' | 'sales' | 'quick'

    const validStatus = ['PENDING', 'PAID', 'EXPIRED', 'CANCELLED']
    const statusWhere = validStatus.includes(statusFilter)
      ? { status: statusFilter as 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED' }
      : {}

    // ── SalesCheckout (checkout de ativo individual) ─────────────────────────
    const salesRaw = (type === 'quick') ? [] : await prisma.salesCheckout.findMany({
      where: statusWhere,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        adsId: true,
        amount: true,
        pixCopyPaste: true,
        pixQrCode: true,
        interTxid: true,
        expiresAt: true,
        paidAt: true,
        createdAt: true,
        utmifySent: true,
        deliverySent: true,
        lead: {
          select: {
            name: true,
            whatsapp: true,
            email: true,
            cpf: true,
          },
        },
      },
    })

    // ── QuickSaleCheckout (checkout da loja / produto) ───────────────────────
    const quickRaw = (type === 'sales') ? [] : await prisma.quickSaleCheckout.findMany({
      where: statusWhere,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        buyerName: true,
        buyerWhatsapp: true,
        buyerEmail: true,
        buyerCpf: true,
        qty: true,
        totalAmount: true,
        pixCopyPaste: true,
        pixQrCode: true,
        interTxid: true,
        expiresAt: true,
        paidAt: true,
        createdAt: true,
        utmifySent: true,
        deliverySent: true,
        listing: {
          select: {
            title: true,
            slug: true,
          },
        },
      },
    })

    // ── Normalização para um formato único ────────────────────────────────────
    type PixItem = {
      id: string
      checkoutType: 'SALES' | 'QUICK'
      status: string
      buyerName: string | null
      buyerWhatsapp: string | null
      buyerEmail: string | null
      amount: number
      qty: number
      description: string
      pixCopyPaste: string | null
      pixQrCode: string | null
      interTxid: string | null
      expiresAt: Date | null
      paidAt: Date | null
      createdAt: Date
      utmifySent: boolean
      deliverySent: boolean
      checkoutUrl: string | null
    }

    const salesItems: PixItem[] = salesRaw.map((s) => ({
      id: s.id,
      checkoutType: 'SALES',
      status: s.status,
      buyerName: s.lead?.name ?? null,
      buyerWhatsapp: s.lead?.whatsapp ?? null,
      buyerEmail: s.lead?.email ?? null,
      amount: Number(s.amount),
      qty: 1,
      description: `Ativo: ${s.adsId}`,
      pixCopyPaste: s.pixCopyPaste,
      pixQrCode: s.pixQrCode,
      interTxid: s.interTxid ?? null,
      expiresAt: s.expiresAt,
      paidAt: s.paidAt,
      createdAt: s.createdAt,
      utmifySent: s.utmifySent,
      deliverySent: s.deliverySent,
      checkoutUrl: `/checkout/${s.adsId}`,
    }))

    const quickItems: PixItem[] = quickRaw.map((q) => ({
      id: q.id,
      checkoutType: 'QUICK',
      status: q.status,
      buyerName: q.buyerName,
      buyerWhatsapp: q.buyerWhatsapp,
      buyerEmail: q.buyerEmail ?? null,
      amount: Number(q.totalAmount),
      qty: q.qty,
      description: q.listing?.title ?? 'Produto',
      pixCopyPaste: q.pixCopyPaste,
      pixQrCode: q.pixQrCode,
      interTxid: q.interTxid ?? null,
      expiresAt: q.expiresAt,
      paidAt: q.paidAt,
      createdAt: q.createdAt,
      utmifySent: q.utmifySent,
      deliverySent: q.deliverySent,
      checkoutUrl: q.listing ? `/loja/${q.listing.slug}?checkoutId=${encodeURIComponent(q.id)}` : null,
    }))

    // Junta e ordena por data de criação (mais recente primeiro)
    const allItems = [...salesItems, ...quickItems].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    ).slice(0, limit)

    // ── Resumo ────────────────────────────────────────────────────────────────
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const summary = {
      totalPending: allItems.filter((i) => i.status === 'PENDING').length,
      totalPaid: allItems.filter((i) => i.status === 'PAID').length,
      totalExpired: allItems.filter((i) => i.status === 'EXPIRED').length,
      paidToday: allItems.filter(
        (i) => i.status === 'PAID' && i.paidAt && new Date(i.paidAt) >= todayStart
      ).length,
      revenueToday: allItems
        .filter((i) => i.status === 'PAID' && i.paidAt && new Date(i.paidAt) >= todayStart)
        .reduce((sum, i) => sum + i.amount, 0),
      revenuePaid: allItems
        .filter((i) => i.status === 'PAID')
        .reduce((sum, i) => sum + i.amount, 0),
    }

    return NextResponse.json({
      summary,
      items: allItems.map((i) => ({
        ...i,
        expiresAt: i.expiresAt?.toISOString() ?? null,
        paidAt: i.paidAt?.toISOString() ?? null,
        createdAt: i.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[pix-checkouts] Erro:', err)
    return NextResponse.json({ error: 'Erro interno', items: [], summary: {} }, { status: 500 })
  }
}
