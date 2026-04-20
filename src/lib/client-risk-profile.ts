import { prisma } from '@/lib/prisma'
import { ORDER_STATUSES_LTV } from '@/lib/intelligence-leads-engine'
import { suggestUpsellSlugs } from '@/lib/intelligence-leads-upsell'

function productToSlug(p: string): string {
  return p
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

/**
 * Recalcula ticket médio, trust score heurístico e próximo upsell a partir de pedidos + chargebacks.
 */
export async function syncClientCommercialIntelligence(clientId: string): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { clientId, status: { in: ORDER_STATUSES_LTV } },
    select: { value: true, product: true, id: true },
  })
  const slugSet = new Set<string>()
  let sum = 0
  for (const o of orders) {
    sum += Number(o.value)
    const s = productToSlug(o.product || '')
    if (s) slugSet.add(s)
  }
  const n = orders.length
  const avg = n > 0 ? Math.round((sum / n) * 100) / 100 : null

  const cbCount = await prisma.chargebackRecord.count({
    where: { order: { clientId } },
  })

  const client = await prisma.clientProfile.findUnique({
    where: { id: clientId },
    select: { refundCount: true, plugPlayErrorCount: true },
  })
  const refundCount = client?.refundCount ?? 0
  const plugErr = client?.plugPlayErrorCount ?? 0

  let trust = 72
  trust -= Math.min(40, refundCount * 12)
  trust -= Math.min(50, cbCount * 25)
  trust -= Math.min(25, plugErr * 8)
  if (n >= 3 && sum > 5000) trust += 8
  trust = Math.max(5, Math.min(100, trust))

  const upsell = suggestUpsellSlugs([...slugSet])
  const nextSlug = upsell[0] ?? null

  const heavyRefund = refundCount >= 5
  await prisma.clientProfile.update({
    where: { id: clientId },
    data: {
      averageTicketBrl: avg,
      trustScore: trust,
      nextBestOfferSlug: nextSlug,
      ...(heavyRefund
        ? {
            riskBlockCheckout: true,
            riskBlockReason:
              'Histórico elevado de reembolsos — rever manualmente antes de novas vendas.',
          }
        : {}),
    },
  })
}

export async function applyClientRiskAfterChargeback(clientId: string): Promise<void> {
  const prev = await prisma.clientProfile.findUnique({
    where: { id: clientId },
    select: { trustScore: true },
  })
  const base = prev?.trustScore ?? 55
  const nextTrust = Math.max(5, base - 25)
  await prisma.clientProfile.update({
    where: { id: clientId },
    data: {
      riskBlockCheckout: true,
      riskBlockReason: 'Chargeback registado — rever manualmente antes de novas vendas.',
      trustScore: nextTrust,
    },
  })
}

export async function assertClientCheckoutAllowed(
  clientId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const c = await prisma.clientProfile.findUnique({
    where: { id: clientId },
    select: { riskBlockCheckout: true, riskBlockReason: true },
  })
  if (!c) return { ok: false, message: 'Cliente não encontrado' }
  if (c.riskBlockCheckout) {
    return {
      ok: false,
      message:
        c.riskBlockReason ||
        'Conta em revisão antifraude. Contacte o suporte ou aguarde liberação manual.',
    }
  }
  return { ok: true }
}
