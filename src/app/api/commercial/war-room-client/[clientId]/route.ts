import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrderWarrantyUiStatus } from '@/lib/order-warranty'

/**
 * Ficha consolidada War Room OS — cliente + pedidos + garantias + notas técnicas (últimas).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL', 'FINANCE', 'DELIVERER'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { clientId } = await params

  const client = await prisma.clientProfile.findUnique({
    where: { id: clientId },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      accountManager: { select: { id: true, name: true, email: true } },
    },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const [orders, ordersAgg, techNotes, warrantyOpen] = await Promise.all([
    prisma.order.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: {
        seller: { select: { name: true } },
        items: {
          select: {
            adsPowerProfileId: true,
            deliveryProxyIp: true,
            deliveryRegion: true,
            accountStatusAtDelivery: true,
          },
        },
        _count: { select: { replacementRequests: true } },
      },
    }),
    prisma.order.aggregate({
      where: { clientId, status: 'DELIVERED' },
      _sum: { value: true },
      _count: true,
    }),
    prisma.clientTechnicalNote.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: { author: { select: { name: true, email: true } } },
    }),
    prisma.order.count({
      where: {
        clientId,
        paidAt: { not: null },
        warrantyEndsAt: { gt: new Date() },
        replacementRequests: { none: {} },
      },
    }),
  ])

  const lastOrder = orders[0]
  const avgTicket =
    ordersAgg._count > 0 ? Number(ordersAgg._sum.value ?? 0) / ordersAgg._count : 0

  const ordersOut = orders.map((o) => ({
    id: o.id,
    product: o.product,
    accountType: o.accountType,
    quantity: o.quantity,
    value: Number(o.value),
    currency: o.currency,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    paidAt: o.paidAt?.toISOString() ?? null,
    deliveryMethod: o.deliveryMethod,
    paymentMethod: o.paymentMethod,
    saleUseNiche: o.saleUseNiche,
    warrantyEndsAt: o.warrantyEndsAt?.toISOString() ?? null,
    warrantyUiStatus: getOrderWarrantyUiStatus({
      paidAt: o.paidAt,
      warrantyEndsAt: o.warrantyEndsAt,
      hasReplacementLinked: o._count.replacementRequests > 0,
    }),
    sellerName: o.seller?.name ?? null,
    items: o.items,
    deliveredAssetIdsJson: o.deliveredAssetIdsJson,
  }))

  return NextResponse.json({
    client: {
      id: client.id,
      clientCode: client.clientCode,
      clientStatus: client.clientStatus,
      country: client.country,
      whatsapp: client.whatsapp,
      taxId: client.taxId,
      companyName: client.companyName,
      jobTitle: client.jobTitle,
      telegramUsername: client.telegramUsername,
      timezone: client.timezone,
      adsPowerEmail: client.adsPowerEmail,
      operationNiche: client.operationNiche,
      trustLevelStars: client.trustLevelStars,
      preferredCurrency: client.preferredCurrency,
      preferredPaymentMethod: client.preferredPaymentMethod,
      leadAcquisitionSource: client.leadAcquisitionSource,
      technicalSupportNotes: client.technicalSupportNotes,
      commercialNotes: client.commercialNotes,
      totalSpent: client.totalSpent != null ? Number(client.totalSpent) : null,
      totalAccountsBought: client.totalAccountsBought,
      lastPurchaseAt: client.lastPurchaseAt?.toISOString() ?? null,
      reputationScore: client.reputationScore,
      user: client.user,
      accountManager: client.accountManager,
    },
    header: {
      ltvApprox: Number(ordersAgg._sum.value ?? 0),
      avgTicketApprox: avgTicket,
      ordersDelivered: ordersAgg._count,
      accountsInWarrantyApprox: warrantyOpen,
      lastProduct: lastOrder ? `${lastOrder.product} (${lastOrder.accountType})` : null,
      lastValue: lastOrder ? Number(lastOrder.value) : null,
      lastCurrency: lastOrder?.currency ?? 'BRL',
    },
    orders: ordersOut,
    technicalNotes: techNotes.map((n) => ({
      id: n.id,
      body: n.body,
      createdAt: n.createdAt.toISOString(),
      authorName: n.author.name || n.author.email,
    })),
  })
}
