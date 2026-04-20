import type { IntelligenceLead, IntelligenceLeadStatus, OrderStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { syncClientCommercialIntelligence } from '@/lib/client-risk-profile'

/** Pedidos que contam para LTV / frequência */
export const ORDER_STATUSES_LTV: OrderStatus[] = [
  'APPROVED',
  'PAID',
  'IN_SEPARATION',
  'IN_DELIVERY',
  'DELIVERED',
]

export function computeEngagementScore(lead: {
  landingPageKey: string | null
  checkoutIntentAt: Date | null
  purchaseCount: number
  totalSales: Prisma.Decimal | number
  status: IntelligenceLeadStatus
}): number {
  let s = 0
  if (lead.landingPageKey?.trim()) s += 10
  if (lead.checkoutIntentAt) s += 20
  const total = typeof lead.totalSales === 'number' ? lead.totalSales : Number(lead.totalSales)
  if (lead.purchaseCount > 0 || total > 0 || lead.status === 'CLIENTE_ATIVO') s += 50
  return Math.min(100, s)
}

export function churnRiskFlags(lead: {
  status: IntelligenceLeadStatus
  lastPurchaseAt: Date | null
}): { churnRisk: boolean; daysSincePurchase: number | null } {
  if (!lead.lastPurchaseAt) {
    return { churnRisk: false, daysSincePurchase: null }
  }
  const days = daysBetween(lead.lastPurchaseAt, new Date())
  const churnRisk = lead.status === 'CLIENTE_ATIVO' && days > 45
  return { churnRisk, daysSincePurchase: days }
}

function daysBetween(from: Date, to: Date): number {
  const a = from.getTime()
  const b = to.getTime()
  return Math.floor((b - a) / 86400000)
}

/** Saúde do cliente: régua 15 / 30 / 60 dias (compra ou, sem compra, arrefecimento do lead). */
export type CustomerHealthBand = 'verde' | 'amarelo' | 'vermelho' | 'neutro'

export function customerHealthBand(lead: {
  lastPurchaseAt: Date | null
  lastInteractionAt: Date | null
  createdAt: Date
}): CustomerHealthBand {
  const now = new Date()
  if (lead.lastPurchaseAt) {
    const d = daysBetween(lead.lastPurchaseAt, now)
    if (d <= 15) return 'verde'
    if (d >= 60) return 'vermelho'
    if (d >= 30) return 'amarelo'
    return 'amarelo'
  }
  const ref = lead.lastInteractionAt ?? lead.createdAt
  const di = daysBetween(ref, now)
  if (di >= 60) return 'vermelho'
  if (di >= 30) return 'amarelo'
  return 'neutro'
}

/** Heurística 0–100: sinal de lead real (não substitui antifraude externa). */
export function computeConfidenceScore(lead: {
  whatsapp: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  checkoutIntentAt: Date | null
  purchaseCount: number
}): number {
  let c = 40
  const wa = lead.whatsapp?.replace(/\D/g, '') ?? ''
  if (wa.length >= 10) c += 15
  if (lead.utmSource?.trim() || lead.utmMedium?.trim() || lead.utmCampaign?.trim()) c += 10
  if (lead.checkoutIntentAt) c += 15
  if (lead.purchaseCount > 0) c += 20
  return Math.min(100, c)
}

function productToSlug(p: string): string {
  return p
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

/** Mesmo fingerprint (hash) em mais de um e-mail → alerta comercial. */
export async function refreshFingerprintAlertsForHash(hash: string | null | undefined): Promise<void> {
  const h = hash?.trim()
  if (!h) return
  const n = await prisma.intelligenceLead.count({ where: { fingerprintHash: h } })
  await prisma.intelligenceLead.updateMany({
    where: { fingerprintHash: h },
    data: { digitalFingerprintAlert: n >= 2 },
  })
}

/** Sincroniza LTV, última compra, contagem e último produto a partir de pedidos ERP (User.email = lead.email). */
export async function syncIntelligenceLeadFromOrders(leadId: string): Promise<void> {
  const lead = await prisma.intelligenceLead.findUnique({
    where: { id: leadId },
    select: { id: true, email: true, status: true, lastInteractionAt: true, trustScore: true },
  })
  if (!lead) return

  const orders = await prisma.order.findMany({
    where: {
      status: { in: ORDER_STATUSES_LTV },
      client: {
        user: { email: lead.email },
      },
    },
    orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
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

  let total = 0
  let lastPaid: Date | null = null
  let lastProduct: string | null = null
  const slugSet = new Set<string>()
  for (const o of orders) {
    total += Number(o.value)
    const t = o.paidAt ?? o.createdAt
    if (!lastPaid || t > lastPaid) {
      lastPaid = t
      lastProduct = o.product?.slice(0, 200) ?? null
    }
    const slug = productToSlug(o.product || '')
    if (slug) slugSet.add(slug)
  }
  const purchasedSlugs = [...slugSet]

  const purchaseCount = orders.length
  const totalSales = Math.round(total * 100) / 100
  const averageTicketBrl =
    purchaseCount > 0 ? Math.round((totalSales / purchaseCount) * 100) / 100 : null

  let nextInteraction = lead.lastInteractionAt
  if (lastPaid) {
    if (!nextInteraction || lastPaid > nextInteraction) nextInteraction = lastPaid
  }

  const statusUpgrade =
    purchaseCount > 0 && (lead.status === 'NOVO' || lead.status === 'QUENTE')
      ? ({ status: 'CLIENTE_ATIVO' as const } as const)
      : ({} as const)

  const updated = await prisma.intelligenceLead.update({
    where: { id: leadId },
    data: {
      totalSales,
      purchaseCount,
      averageTicketBrl,
      lastPurchaseAt: lastPaid,
      lastProductName: lastProduct,
      purchasedProductSlugs: purchasedSlugs,
      ...(purchaseCount > 0 ? { hotStalledAlert: false, cartRescueImmediate: false } : {}),
      ...(nextInteraction ? { lastInteractionAt: nextInteraction } : {}),
      ...statusUpgrade,
    },
    select: {
      landingPageKey: true,
      checkoutIntentAt: true,
      purchaseCount: true,
      totalSales: true,
      status: true,
      whatsapp: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
    },
  })

  const score = computeEngagementScore({
    landingPageKey: updated.landingPageKey,
    checkoutIntentAt: updated.checkoutIntentAt,
    purchaseCount: updated.purchaseCount,
    totalSales: updated.totalSales,
    status: updated.status,
  })

  const conf = computeConfidenceScore({
    whatsapp: updated.whatsapp,
    utmSource: updated.utmSource,
    utmMedium: updated.utmMedium,
    utmCampaign: updated.utmCampaign,
    checkoutIntentAt: updated.checkoutIntentAt,
    purchaseCount: updated.purchaseCount,
  })

  const trustFill =
    lead.trustScore == null
      ? { trustScore: Math.min(100, Math.max(0, Math.round(Number(conf)))) }
      : {}

  await prisma.intelligenceLead.update({
    where: { id: leadId },
    data: { engagementScore: score, confidenceScore: conf, ...trustFill },
  })

  const paidEvents = await prisma.intelligenceLeadEvent.findMany({
    where: { leadId, eventType: 'ORDER_PAID' },
    select: { metadata: true },
  })
  const seenOrderIds = new Set(
    paidEvents
      .map((e) => (e.metadata as { orderId?: string } | null)?.orderId)
      .filter((x): x is string => Boolean(x)),
  )

  for (const o of orders.slice(0, 25)) {
    const orderId = o.id
    if (seenOrderIds.has(orderId)) continue
    const when = o.paidAt ?? o.createdAt
    const method = o.paymentMethod || '—'
    await prisma.intelligenceLeadEvent.create({
      data: {
        leadId,
        occurredAt: when,
        eventType: 'ORDER_PAID',
        title: `Pedido ${o.status}: ${o.product.slice(0, 120)}`,
        detail: `Valor: R$ ${Number(o.value).toFixed(2)} · ${method}`,
        metadata: { orderId: o.id, status: o.status, value: Number(o.value) },
      },
    })
  }

  const user = await prisma.user.findFirst({
    where: { email: lead.email },
    select: { clientProfile: { select: { id: true } } },
  })
  if (user?.clientProfile?.id) {
    try {
      await syncClientCommercialIntelligence(user.clientProfile.id)
    } catch {
      /* opcional */
    }
  }
}

export type RfmRow = {
  leadId: string
  name: string
  email: string
  recencyDays: number
  frequency: number
  monetary: number
  rfmScore: number
}

/**
 * RFM: Recência (dias), Frequência (pedidos), Monetário (LTV).
 * Ranking: prioriza valor monetário, depois frequência, depois recência (compra mais recente melhor).
 * Top 1% = fatia superior por LTV (elite comercial).
 */
export function computeRfmRankings(
  rows: { id: string; name: string; email: string; lastPurchaseAt: Date | null; purchaseCount: number; totalSales: number }[],
): { topPct: RfmRow[]; all: RfmRow[] } {
  const now = Date.now()
  const all: RfmRow[] = rows.map((r) => {
    const recencyDays = r.lastPurchaseAt ? Math.floor((now - r.lastPurchaseAt.getTime()) / 86400000) : 9999
    const frequency = r.purchaseCount
    const monetary = r.totalSales
    const rfmScore = monetary * 10000 + frequency * 100 + Math.max(0, 5000 - recencyDays)
    return { leadId: r.id, name: r.name, email: r.email, recencyDays, frequency, monetary, rfmScore }
  })
  all.sort((a, b) => b.rfmScore - a.rfmScore)
  const cut = Math.max(1, Math.ceil(all.length * 0.01))
  const topPct = all.slice(0, cut)
  return { topPct, all }
}
