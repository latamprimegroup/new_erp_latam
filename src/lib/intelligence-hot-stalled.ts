import { prisma } from '@/lib/prisma'

const EXCLUDED_FROM_INTENSITY = new Set(['ORDER_PAID', 'NOTE'])

/**
 * Lead com vários sinais de intenção em X horas e ainda sem compra → alerta comercial.
 */
export async function refreshHotStalledAlert(leadId: string): Promise<void> {
  const threshold = Math.max(
    1,
    parseInt(process.env.INTELLIGENCE_HOT_STALLED_EVENT_THRESHOLD || '5', 10) || 5,
  )
  const hours = Math.max(
    1,
    parseInt(process.env.INTELLIGENCE_HOT_STALLED_WINDOW_HOURS || '24', 10) || 24,
  )

  const lead = await prisma.intelligenceLead.findUnique({
    where: { id: leadId },
    select: { purchaseCount: true },
  })
  if (!lead) return

  if (lead.purchaseCount > 0) {
    await prisma.intelligenceLead.update({
      where: { id: leadId },
      data: { hotStalledAlert: false },
    })
    return
  }

  const since = new Date(Date.now() - hours * 3600000)
  const events = await prisma.intelligenceLeadEvent.findMany({
    where: { leadId, occurredAt: { gte: since } },
    select: { eventType: true },
  })
  const intensity = events.filter((e) => !EXCLUDED_FROM_INTENSITY.has(e.eventType)).length
  const hot = intensity >= threshold

  await prisma.intelligenceLead.update({
    where: { id: leadId },
    data: { hotStalledAlert: hot },
  })
}
