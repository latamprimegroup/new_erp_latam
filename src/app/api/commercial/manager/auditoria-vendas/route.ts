import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSalesManagerAccess, resolveManagedSellerIds } from '@/lib/commercial-hierarchy'
import type { Prisma } from '@prisma/client'

type AuditSellerFilter =
  | {}
  | { sellerId: string }
  | { sellerId: { in: string[] } }

const PAID_ORDER_STATUSES = ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] as const

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
  const auth = await requireSalesManagerAccess()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const sellerId = searchParams.get('sellerId') || undefined
  const onlyAuditPending = searchParams.get('somentePendente') === '1'
  const take = Math.min(200, Math.max(1, parseInt(searchParams.get('take') || '100', 10) || 100))

  const scope = await resolveManagedSellerIds(auth.session.user.id, auth.session.user.role || '')
  if (scope.type === 'none') {
    return NextResponse.json({ rows: [], total: 0 })
  }

  const sellerFilter: AuditSellerFilter =
    scope.type === 'all'
      ? (sellerId ? { sellerId } : {})
      : {
          sellerId: sellerId
            ? (scope.sellerIds.includes(sellerId) ? sellerId : '__NO_SCOPE__')
            : { in: scope.sellerIds },
        }

  const whereOrder: Prisma.OrderWhereInput = {
    status: { in: ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] as const },
    ...sellerFilter,
    ...(onlyAuditPending ? { commercialAuditAt: null } : {}),
  }

  const whereQuick: Prisma.QuickSaleCheckoutWhereInput = {
    status: 'PAID' as const,
    ...sellerFilter,
    ...(onlyAuditPending ? { commercialAuditAt: null } : {}),
  }

  const [orders, quickSales] = await Promise.all([
    prisma.order.findMany({
      where: whereOrder,
      orderBy: { paidAt: 'desc' },
      take,
      select: {
        id: true,
        paidAt: true,
        product: true,
        accountType: true,
        quantity: true,
        sellerId: true,
        seller: { select: { name: true, email: true } },
        paymentMethod: true,
        value: true,
        supplierCost: true,
        netProfit: true,
        status: true,
        commercialAuditAt: true,
        client: {
          select: {
            user: { select: { name: true, email: true } },
            taxId: true,
          },
        },
        deliveredAssetIdsJson: true,
      },
    }),
    prisma.quickSaleCheckout.findMany({
      where: whereQuick,
      orderBy: { paidAt: 'desc' },
      take,
      include: {
        seller: { select: { name: true, email: true } },
        listing: { select: { title: true, assetCategory: true } },
      },
    }),
  ])

  const rows = [
    ...orders.map((o) => ({
      source:          'ORDER' as const,
      saleId:          o.id,
      paidAt:          o.paidAt?.toISOString() ?? null,
      sellerId:        o.sellerId ?? null,
      sellerName:      o.seller?.name ?? o.seller?.email ?? 'N/A',
      clientName:      o.client?.user?.name ?? o.client?.user?.email ?? 'N/A',
      clientEmail:     o.client?.user?.email ?? null,
      clientTaxId:     o.client?.taxId ?? null,
      product:         o.product ?? '',
      accountType:     o.accountType ?? '',
      quantity:        o.quantity ?? 1,
      valueBrl:        Number(o.value ?? 0),
      supplierCostBrl: Number(o.supplierCost ?? 0),
      netProfitBrl:    Number(o.netProfit ?? 0),
      paymentMethod:   o.paymentMethod ?? 'PIX',
      deliveredAssetPublicIds: Array.isArray(o.deliveredAssetIdsJson)
        ? o.deliveredAssetIdsJson.filter((v): v is string => typeof v === 'string')
        : [],
      status:          o.status,
      auditedAt:       o.commercialAuditAt?.toISOString() ?? null,
      auditedByName:   null,
    })),
    ...quickSales.map((q) => ({
      source:          'QUICK_SALE' as const,
      saleId:          q.id,
      paidAt:          q.paidAt?.toISOString() ?? null,
      sellerId:        q.sellerId ?? null,
      sellerName:      q.seller?.name ?? q.seller?.email ?? 'N/A',
      clientName:      q.buyerName || 'N/A',
      clientEmail:     q.buyerEmail ?? null,
      clientTaxId:     q.buyerCpf ?? null,
      product:         q.listing.title ?? '',
      accountType:     q.listing.assetCategory ?? '',
      quantity:        q.qty ?? 1,
      valueBrl:        Number(q.totalAmount ?? 0),
      supplierCostBrl: Number(q.supplierCost ?? 0),
      netProfitBrl:    Number(q.netProfit ?? 0),
      paymentMethod:   'PIX',
      deliveredAssetPublicIds: Array.isArray(q.reservedAssetIds)
        ? q.reservedAssetIds.filter((v): v is string => typeof v === 'string')
        : [],
      status:          q.status,
      auditedAt:       q.commercialAuditAt?.toISOString() ?? null,
      auditedByName:   null,
    })),
  ].sort((a, b) => {
    const ta = a.paidAt ? new Date(a.paidAt).getTime() : 0
    const tb = b.paidAt ? new Date(b.paidAt).getTime() : 0
    return tb - ta
  })

  return NextResponse.json({
    total: rows.length,
    rows,
  })
  } catch (err) {
    console.error('[manager/auditoria-vendas GET] Erro:', err)
    return NextResponse.json({ error: 'Erro ao carregar auditoria de vendas', rows: [], total: 0 }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSalesManagerAccess()
  if (!auth.ok) return auth.response

  const payload = (await req.json().catch(() => null)) as { source?: 'ORDER' | 'QUICK_SALE'; saleId?: string } | null
  const source = payload?.source
  const saleId = payload?.saleId
  if (!source || !saleId) return NextResponse.json({ error: 'source e saleId são obrigatórios' }, { status: 400 })

  const scope = await resolveManagedSellerIds(auth.session.user.id, auth.session.user.role || '')
  if (scope.type === 'none') {
    return NextResponse.json({ error: 'Sem escopo de equipe comercial para auditoria' }, { status: 403 })
  }
  const canManageSeller = (sellerId: string | null): boolean => {
    if (scope.type === 'all') return true
    if (!sellerId) return false
    return scope.sellerIds.includes(sellerId)
  }

  if (source === 'ORDER') {
    const order = await prisma.order.findUnique({
      where: { id: saleId },
      select: { id: true, sellerId: true, commercialAuditAt: true, status: true },
    })
    if (!order) return NextResponse.json({ error: 'Venda não encontrada' }, { status: 404 })
    if (!PAID_ORDER_STATUSES.includes(order.status as (typeof PAID_ORDER_STATUSES)[number])) {
      return NextResponse.json({ error: 'Somente vendas aprovadas podem ser auditadas' }, { status: 422 })
    }
    if (!canManageSeller(order.sellerId)) {
      return NextResponse.json({ error: 'Sem escopo para auditar essa venda' }, { status: 403 })
    }
    const updated = await prisma.order.update({
      where: { id: saleId },
      data: { commercialAuditAt: new Date() },
      select: { id: true, commercialAuditAt: true },
    })
    return NextResponse.json({ ok: true, source, saleId: updated.id, auditedAt: updated.commercialAuditAt?.toISOString() ?? null })
  }

  const quick = await prisma.quickSaleCheckout.findUnique({
    where: { id: saleId },
    select: { id: true, sellerId: true, commercialAuditAt: true, status: true },
  })
  if (!quick) return NextResponse.json({ error: 'Venda não encontrada' }, { status: 404 })
  if (quick.status !== 'PAID') {
    return NextResponse.json({ error: 'Somente vendas aprovadas podem ser auditadas' }, { status: 422 })
  }
  if (!canManageSeller(quick.sellerId)) {
    return NextResponse.json({ error: 'Sem escopo para auditar essa venda' }, { status: 403 })
  }

  const updated = await prisma.quickSaleCheckout.update({
    where: { id: saleId },
    data: { commercialAuditAt: new Date() },
    select: { id: true, commercialAuditAt: true },
  })
  return NextResponse.json({ ok: true, source, saleId: updated.id, auditedAt: updated.commercialAuditAt?.toISOString() ?? null })
}

