import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const rescueMin = parseInt(process.env.CHECKOUT_RESCUE_AFTER_MINUTES || '15', 10) || 15
const RESCUE_AFTER_MS = rescueMin * 60000

/**
 * Sessões em pagamento pendente há mais de X min → RESCUE_IMMEDIATE + lead.cartRescueImmediate
 */
export async function processCheckoutRescueTimeouts(): Promise<{ flagged: number }> {
  const cutoff = new Date(Date.now() - RESCUE_AFTER_MS)
  const pending = await prisma.intelligenceCheckoutSession.findMany({
    where: {
      status: 'PAYMENT_PENDING',
      approvedAt: null,
      startedAt: { lt: cutoff },
    },
    select: { id: true, leadId: true, email: true },
  })
  let flagged = 0
  for (const s of pending) {
    await prisma.intelligenceCheckoutSession.update({
      where: { id: s.id },
      data: { status: 'RESCUE_IMMEDIATE' },
    })
    if (s.leadId) {
      await prisma.intelligenceLead.update({
        where: { id: s.leadId },
        data: { cartRescueImmediate: true },
      })
    } else {
      const lead = await prisma.intelligenceLead.findUnique({
        where: { email: s.email.trim().toLowerCase() },
        select: { id: true },
      })
      if (lead) {
        await prisma.intelligenceLead.update({
          where: { id: lead.id },
          data: { cartRescueImmediate: true },
        })
        await prisma.intelligenceCheckoutSession.update({
          where: { id: s.id },
          data: { leadId: lead.id },
        })
      }
    }
    flagged++
  }
  return { flagged }
}

export async function upsertCheckoutSessionFromWebhook(input: {
  email: string
  event: 'initiated' | 'payment_pending' | 'approved' | 'abandoned'
  gatewayCode?: string | null
  externalRef?: string | null
  valueBrl?: number | null
  metadata?: Prisma.InputJsonValue
}): Promise<{ sessionId: string; leadId: string | null }> {
  const email = input.email.trim().toLowerCase()
  const lead = await prisma.intelligenceLead.findUnique({
    where: { email },
    select: { id: true },
  })

  let status: 'STARTED' | 'PAYMENT_PENDING' | 'APPROVED' | 'ABANDONED' | 'RESCUE_IMMEDIATE' = 'STARTED'
  if (input.event === 'payment_pending') status = 'PAYMENT_PENDING'
  if (input.event === 'approved') status = 'APPROVED'
  if (input.event === 'abandoned') status = 'ABANDONED'

  const externalRef = input.externalRef?.trim().slice(0, 200) || null

  if (externalRef) {
    const existing = await prisma.intelligenceCheckoutSession.findFirst({
      where: { email, externalRef },
      select: { id: true },
    })
    if (existing) {
      const approvedAt = input.event === 'approved' ? new Date() : undefined
      await prisma.intelligenceCheckoutSession.update({
        where: { id: existing.id },
        data: {
          status,
          gatewayCode: input.gatewayCode?.slice(0, 32) ?? undefined,
          valueBrl:
            input.valueBrl != null && Number.isFinite(input.valueBrl)
              ? Math.round(input.valueBrl * 100) / 100
              : undefined,
          approvedAt: approvedAt ?? undefined,
          leadId: lead?.id ?? undefined,
          metadata: input.metadata ?? undefined,
        },
      })
      if (input.event === 'approved' && lead) {
        await prisma.intelligenceLead.update({
          where: { id: lead.id },
          data: { cartRescueImmediate: false },
        })
      }
      return { sessionId: existing.id, leadId: lead?.id ?? null }
    }
  }

  const created = await prisma.intelligenceCheckoutSession.create({
    data: {
      email,
      leadId: lead?.id ?? null,
      status,
      gatewayCode: input.gatewayCode?.slice(0, 32) ?? null,
      externalRef,
      valueBrl:
        input.valueBrl != null && Number.isFinite(input.valueBrl)
          ? Math.round(input.valueBrl * 100) / 100
          : null,
      approvedAt: input.event === 'approved' ? new Date() : null,
      metadata: input.metadata ?? undefined,
    },
  })
  if (input.event === 'approved' && lead) {
    await prisma.intelligenceLead.update({
      where: { id: lead.id },
      data: { cartRescueImmediate: false },
    })
  }
  return { sessionId: created.id, leadId: lead?.id ?? null }
}
