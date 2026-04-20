import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/api-auth'
import {
  ORDER_STATUSES_LTV,
  customerHealthBand,
} from '@/lib/intelligence-leads-engine'
import { suggestUpsellSlugs } from '@/lib/intelligence-leads-upsell'
import { logCommercialDataAudit } from '@/lib/commercial-audit-log'
import { buildConversionPathSummary } from '@/lib/intelligence-conversion-path'

const ROLES_READ = ['ADMIN', 'COMMERCIAL', 'FINANCE'] as const

type TimelineItem = {
  occurredAt: string
  eventType: string
  title: string
  detail: string | null
  source: 'event' | 'order'
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES_READ])
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const role = auth.session.user.role
  const userId = auth.session.user.id

  const lead = await prisma.intelligenceLead.findUnique({
    where: { id },
    include: {
      events: { orderBy: { occurredAt: 'desc' }, take: 80 },
    },
  })

  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  if (role === 'COMMERCIAL' && lead.assignedCommercialId !== userId) {
    return NextResponse.json({ error: 'Lead não atribuído a si' }, { status: 403 })
  }

  void logCommercialDataAudit({
    userId,
    role,
    action: 'VIEW_INTELLIGENCE_LEAD',
    entityType: 'INTELLIGENCE_LEAD',
    entityId: id,
  })

  const orders = await prisma.order.findMany({
    where: {
      status: { in: ORDER_STATUSES_LTV },
      client: {
        user: { email: lead.email },
      },
    },
    orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    take: 40,
    select: {
      id: true,
      product: true,
      value: true,
      status: true,
      paidAt: true,
      createdAt: true,
      paymentMethod: true,
    },
  })

  const fromEvents: TimelineItem[] = lead.events.map((e) => ({
    occurredAt: e.occurredAt.toISOString(),
    eventType: e.eventType,
    title: e.title,
    detail: e.detail,
    source: 'event' as const,
  }))

  const fromOrders: TimelineItem[] = orders.map((o) => {
    const when = o.paidAt ?? o.createdAt
    const method = o.paymentMethod || '—'
    const paid = o.paidAt ? 'Pago' : 'Registado'
    return {
      occurredAt: when.toISOString(),
      eventType: 'ORDER',
      title: `${paid} · ${o.product.slice(0, 100)}`,
      detail: `Ticket: R$ ${Number(o.value).toFixed(2)} · ${method} · status ${o.status}`,
      source: 'order' as const,
    }
  })

  const timeline = [...fromEvents, ...fromOrders].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  )

  const health = customerHealthBand({
    lastPurchaseAt: lead.lastPurchaseAt,
    lastInteractionAt: lead.lastInteractionAt,
    createdAt: lead.createdAt,
  })
  const upsellSuggestions = suggestUpsellSlugs(lead.purchasedProductSlugs)

  return NextResponse.json({
    lead: {
      id: lead.id,
      name: lead.name,
      email: lead.email,
      whatsapp: lead.whatsapp,
      utmSource: lead.utmSource,
      utmMedium: lead.utmMedium,
      utmCampaign: lead.utmCampaign,
      utmFirstSource: lead.utmFirstSource,
      utmFirstMedium: lead.utmFirstMedium,
      utmFirstCampaign: lead.utmFirstCampaign,
      utmFirstContent: lead.utmFirstContent,
      utmFirstTerm: lead.utmFirstTerm,
      utmContent: lead.utmContent,
      utmTerm: lead.utmTerm,
      trustScore: lead.trustScore,
      averageTicketBrl: lead.averageTicketBrl != null ? Number(lead.averageTicketBrl) : null,
      status: lead.status,
      lastPurchaseAt: lead.lastPurchaseAt?.toISOString() ?? null,
      lastInteractionAt: lead.lastInteractionAt?.toISOString() ?? null,
      totalSales: Number(lead.totalSales),
      purchaseCount: lead.purchaseCount,
      lastProductName: lead.lastProductName,
      engagementScore: lead.engagementScore,
      confidenceScore: Number(lead.confidenceScore),
      digitalFingerprintAlert: lead.digitalFingerprintAlert,
      behaviorTags: lead.behaviorTags,
      purchasedProductSlugs: lead.purchasedProductSlugs,
      upsellSuggestions,
      customerHealth: health,
      cpaBrl: lead.cpaBrl != null ? Number(lead.cpaBrl) : null,
      profitAfterCpaBrl:
        lead.cpaBrl != null
          ? Math.round((Number(lead.totalSales) - Number(lead.cpaBrl)) * 100) / 100
          : null,
      hotStalledAlert: lead.hotStalledAlert,
      commercialAiBrief: lead.commercialAiBrief,
      cartRescueImmediate: lead.cartRescueImmediate,
      conversionPathSummary: buildConversionPathSummary(lead),
      assignedCommercialId: lead.assignedCommercialId,
      landingPageKey: lead.landingPageKey,
      checkoutIntentAt: lead.checkoutIntentAt?.toISOString() ?? null,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
    },
    timeline,
  })
}

const patchSchema = z.object({
  assignedCommercialId: z.union([z.string().min(1), z.null()]).optional(),
})

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  let body: z.infer<typeof patchSchema>
  try {
    body = patchSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const lead = await prisma.intelligenceLead.findUnique({ where: { id }, select: { id: true } })
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const updated = await prisma.intelligenceLead.update({
    where: { id },
    data: {
      ...(body.assignedCommercialId !== undefined
        ? { assignedCommercialId: body.assignedCommercialId }
        : {}),
    },
    select: { id: true, assignedCommercialId: true },
  })

  return NextResponse.json({ ok: true, lead: updated })
}
