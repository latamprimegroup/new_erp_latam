import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { getPaginationParams, paginatedResponse } from '@/lib/pagination'
import { getAuthenticatedKey, withRateLimit } from '@/lib/rate-limit-api'
import { getCommercialVolumeDiscountPercent, applyPercentDiscount } from '@/lib/commercial-pricing'
import {
  isBlockedForPlugPlay,
  isG2PremiumLabel,
  isHighRiskScore,
  recalculateCustomerScore,
} from '@/lib/reputation-engine'
import { getOrderWarrantyUiStatus } from '@/lib/order-warranty'

const createSchema = z.object({
  clientId: z.string().min(1),
  country: z.string().optional(),
  product: z.string().min(1),
  accountType: z.string().min(1),
  quantity: z.number().int().positive(),
  value: z.number().positive(),
  currency: z.enum(['BRL', 'USD']).optional(),
  markupBrl: z.number().min(0).optional(),
  discountCode: z.string().max(64).optional(),
  deliveryMethod: z.enum(['ADSPOWER_SHARE', 'SPREADSHEET', 'ERP_DIRECT']).optional(),
  unitValue: z.number().min(0).optional(),
  fxRateBrlToUsd: z.number().min(0).optional(),
  paymentMethod: z
    .enum(['BANK_TRANSFER', 'STRIPE', 'CRYPTO', 'LEAD_BANK', 'PIX', 'OUTRO'])
    .optional(),
  paymentReferenceMemo: z.string().max(120).optional(),
  documentationUrl: z.string().max(500).optional().or(z.literal('')),
  saleUseNiche: z.string().max(48).optional(),
  warrantyHours: z.number().int().min(1).max(8760).optional(),
  /** Um ID por linha ou separados por vírgula — gravado em deliveredAssetIdsJson */
  deliveredAssetIdsText: z.string().max(12000).optional(),
  /** Referência livre (afiliado externo, memo Lead Bank, etc.) */
  externalRef: z.string().max(120).optional(),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const readRoles = ['ADMIN', 'COMMERCIAL', 'FINANCE']
  if (!session.user?.role || !readRoles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const clientId = searchParams.get('clientId')
  const { page, limit, skip } = getPaginationParams(searchParams)

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (clientId) where.clientId = clientId

  const orderInclude = {
    client: { include: { user: { select: { name: true, email: true } } } },
    seller: { select: { name: true } },
    items: {
      select: {
        id: true,
        adsPowerProfileId: true,
        deliveryProxyIp: true,
        deliveryRegion: true,
        accountStatusAtDelivery: true,
      },
    },
    _count: { select: { replacementRequests: true } },
  }

  const [pageOrders, total, pendingCount, completedCount] = await Promise.all([
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.order.count({ where }),
    prisma.order.count({ where: { status: { in: ['PENDING', 'PAID', 'IN_DELIVERY'] } } }),
    prisma.order.count({ where: { status: 'DELIVERED' } }),
  ])

  let orders = pageOrders
  const orderIdHighlight = searchParams.get('orderId')?.trim()
  if (orderIdHighlight) {
    const highlighted = await prisma.order.findFirst({
      where: { id: orderIdHighlight },
      include: orderInclude as never,
    })
    if (highlighted) {
      const ids = new Set(orders.map((o) => o.id))
      if (!ids.has(highlighted.id)) {
        orders = [highlighted as (typeof orders)[number], ...orders]
      }
    }
  }

  const totalRevenue = await prisma.order.aggregate({
    where: { status: 'DELIVERED' },
    _sum: { value: true },
  })

  const serializeOrder = (o: (typeof orders)[number]) => {
    const paidAt = o.paidAt
    const warrantyEndsAt = o.warrantyEndsAt
    const hasR = (o as { _count?: { replacementRequests: number } })._count?.replacementRequests
      ? (o as { _count: { replacementRequests: number } })._count.replacementRequests > 0
      : false
    const warrantyUi = getOrderWarrantyUiStatus({
      paidAt,
      warrantyEndsAt,
      hasReplacementLinked: hasR,
    })
    const row = o as {
      value: unknown
      unitValue?: unknown
      markupBrl?: unknown
      fxRateBrlToUsd?: unknown
      _count?: { replacementRequests: number }
      [key: string]: unknown
    }
    const { _count: _rc, ...rest } = row
    const dec = (v: unknown) =>
      v == null ? null : typeof v === 'object' && v !== null && 'toString' in v
        ? Number((v as { toString: () => string }).toString())
        : Number(v)
    return {
      ...rest,
      value: dec(row.value) ?? 0,
      unitValue: dec(row.unitValue),
      markupBrl: dec(row.markupBrl),
      fxRateBrlToUsd: dec(row.fxRateBrlToUsd),
      warrantyUiStatus: warrantyUi,
      replacementCount: _rc?.replacementRequests ?? 0,
    }
  }

  const paginated = paginatedResponse(orders, total, page, limit)
  return NextResponse.json({
    ...paginated,
    orders: paginated.items.map(serializeOrder),
    kpis: {
      revenue: Number(totalRevenue._sum.value ?? 0),
      pending: pendingCount,
      completed: completedCount,
    },
  })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const key = getAuthenticatedKey(session.user!.id, 'vendas:create')
  const limited = withRateLimit(req, key, { max: 30, windowMs: 60_000 })
  if (limited) return limited

  const roles = ['ADMIN', 'COMMERCIAL']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = createSchema.parse(body)
    const isPremiumG2 = isG2PremiumLabel(data.accountType, data.product)

    const { assertClientCheckoutAllowed } = await import('@/lib/client-risk-profile')
    const gate = await assertClientCheckoutAllowed(data.clientId)
    if (!gate.ok) {
      return NextResponse.json({ error: gate.message }, { status: 403 })
    }

    if (isPremiumG2) {
      const rep = await recalculateCustomerScore(data.clientId)
      if (rep && (isHighRiskScore(rep.score) || isBlockedForPlugPlay(rep.plugPlayErrorCount))) {
        return NextResponse.json(
          {
            error:
              'Cliente em perfil de risco para G2 Premium (Score < 50 ou bloqueio por garantia reversa). Faça auditoria de método antes de vender Plug & Play.',
          },
          { status: 403 }
        )
      }
    }

    let finalValue = data.value
    let discountCode = data.discountCode?.trim().toUpperCase() || null
    let couponApplied = false
    if (discountCode) {
      const coupon = await prisma.commercialCoupon.findFirst({
        where: { code: discountCode, active: true },
      })
      if (coupon && data.quantity >= coupon.minQuantity) {
        finalValue = applyPercentDiscount(finalValue, coupon.percentOff)
        couponApplied = true
      }
    }
    if (!couponApplied) {
      const volPct = await getCommercialVolumeDiscountPercent(data.quantity)
      if (volPct > 0) {
        finalValue = applyPercentDiscount(finalValue, volPct)
        if (!discountCode) discountCode = `AUTO_LOTE_${volPct}PCT`
      }
    }

    const deliveredIds =
      data.deliveredAssetIdsText
        ?.split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 200) ?? null
    const deliveredAssetIdsJson: Prisma.InputJsonValue | undefined =
      deliveredIds?.length ? deliveredIds : undefined

    const order = await prisma.order.create({
      data: {
        clientId: data.clientId,
        country: data.country || null,
        product: data.product,
        accountType: data.accountType,
        quantity: data.quantity,
        value: finalValue,
        currency: data.currency || 'BRL',
        status: 'AWAITING_PAYMENT',
        sellerId: session.user.id,
        markupBrl: data.markupBrl != null ? data.markupBrl : null,
        discountCode,
        deliveryMethod: data.deliveryMethod ?? null,
        unitValue: data.unitValue != null ? data.unitValue : null,
        fxRateBrlToUsd: data.fxRateBrlToUsd != null ? data.fxRateBrlToUsd : null,
        paymentMethod: data.paymentMethod ?? null,
        paymentReferenceMemo: data.paymentReferenceMemo?.trim() || null,
        documentationUrl:
          data.documentationUrl && data.documentationUrl.trim() ? data.documentationUrl.trim() : null,
        saleUseNiche: data.saleUseNiche?.trim() || null,
        warrantyHours: data.warrantyHours ?? 48,
        ...(deliveredAssetIdsJson !== undefined ? { deliveredAssetIdsJson } : {}),
        externalRef: data.externalRef?.trim() || null,
      },
      include: {
        client: { include: { user: { select: { name: true, email: true } } } },
        seller: { select: { name: true } },
      },
    })

    await audit({
      userId: session.user.id,
      action: 'order_created',
      entity: 'Order',
      entityId: order.id,
    })

    return NextResponse.json(order)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao registrar venda' }, { status: 500 })
  }
}
