/**
 * GET /api/admin/pedidos
 * Lista todos os pedidos (QuickSaleCheckout) com dados completos.
 * Roles: ADMIN, COMMERCIAL, FINANCE
 *
 * Query params:
 *   status  — PENDING | PAID | EXPIRED | CANCELLED (default: all)
 *   search  — busca por orderNumber, buyerName, buyerCpf, buyerWhatsapp
 *   page    — página (default: 1)
 *   limit   — itens por página (default: 50, max: 200)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['ADMIN', 'COMMERCIAL', 'FINANCE']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!ALLOWED_ROLES.includes(session.user.role ?? ''))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const sp      = req.nextUrl.searchParams
  const status  = sp.get('status')?.toUpperCase() || ''
  const search  = (sp.get('search') ?? '').trim()
  const page    = Math.max(1, Number(sp.get('page')  || 1))
  const limit   = Math.min(200, Math.max(10, Number(sp.get('limit') || 50)))
  const skip    = (page - 1) * limit

  // ── Filtro base ────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {}

  if (status && ['PENDING', 'PAID', 'EXPIRED', 'CANCELLED'].includes(status)) {
    where.status = status
  }

  if (search) {
    where.OR = [
      { orderNumber:    { contains: search } },
      { buyerName:      { contains: search } },
      { buyerCpf:       { contains: search.replace(/\D/g, '') } },
      { buyerWhatsapp:  { contains: search.replace(/\D/g, '') } },
      { buyerEmail:     { contains: search } },
      { interTxid:      { contains: search } },
    ]
  }

  // ── Role restriction — COMMERCIAL vê só os seus ────────────────────────────
  if (session.user.role === 'COMMERCIAL') {
    where.sellerId = session.user.id
  }

  const [total, rows] = await Promise.all([
    prisma.quickSaleCheckout.count({ where }),
    prisma.quickSaleCheckout.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take:    limit,
      include: {
        listing: { select: { title: true, slug: true, assetCategory: true } },
        seller:  { select: { name: true, email: true } },
        manager: { select: { name: true, email: true } },
      },
    }),
  ])

  // ── Métricas rápidas do conjunto filtrado (sem paginação) ──────────────────
  const [metricPaid, metricPending, metricExpired, revenueAgg] = await Promise.all([
    prisma.quickSaleCheckout.count({ where: { ...where, status: 'PAID' } }),
    prisma.quickSaleCheckout.count({ where: { ...where, status: 'PENDING' } }),
    prisma.quickSaleCheckout.count({ where: { ...where, status: 'EXPIRED' } }),
    prisma.quickSaleCheckout.aggregate({
      where: { ...where, status: 'PAID' },
      _sum: { totalAmount: true },
    }),
  ])

  const items = rows.map((r) => ({
    id:            r.id,
    orderNumber:   r.orderNumber ?? null,
    status:        r.status,
    buyerName:     r.buyerName,
    buyerDoc:      r.buyerCpf,   // CPF (11) ou CNPJ (14)
    buyerWhatsapp: r.buyerWhatsapp,
    buyerEmail:    r.buyerEmail ?? null,
    qty:           r.qty,
    totalAmount:   Number(r.totalAmount),
    product:       r.listing.title,
    productSlug:   r.listing.slug,
    assetCategory: r.listing.assetCategory,
    pixCopyPaste:  r.pixCopyPaste ?? null,
    qrCode:        r.pixQrCode   ?? null,
    interTxid:     r.interTxid   ?? null,
    interE2eId:    r.interE2eId  ?? null,
    expiresAt:     r.expiresAt?.toISOString()  ?? null,
    paidAt:        r.paidAt?.toISOString()     ?? null,
    warrantyEndsAt: r.warrantyEndsAt?.toISOString() ?? null,
    deliverySent:  r.deliverySent,
    utmifySent:    r.utmifySent,
    seller:        r.seller  ? { name: r.seller.name,  email: r.seller.email }  : null,
    manager:       r.manager ? { name: r.manager.name, email: r.manager.email } : null,
    utms: {
      source:   r.utmSource   ?? null,
      medium:   r.utmMedium   ?? null,
      campaign: r.utmCampaign ?? null,
      content:  r.utmContent  ?? null,
      term:     r.utmTerm     ?? null,
      src:      r.utmSrc      ?? null,
      fbclid:   r.fbclid      ?? null,
      gclid:    r.gclid       ?? null,
      referrer: r.referrer    ?? null,
    },
    reservedAssetIds: r.reservedAssetIds ?? [],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))

  return NextResponse.json({
    metrics: {
      total,
      paid:     metricPaid,
      pending:  metricPending,
      expired:  metricExpired,
      revenue:  Number(revenueAgg._sum.totalAmount ?? 0),
    },
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    items,
  })
}
