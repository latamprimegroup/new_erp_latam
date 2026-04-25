/**
 * GET  /api/admin/subscriptions — Lista assinaturas (com filtros)
 * POST /api/admin/subscriptions — Cria nova assinatura
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import type { ClientProfileType, SubscriptionStatus } from '@prisma/client'
import { addMonths, addQuarters } from 'date-fns'

function isAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  const role = (session?.user as { role?: string } | undefined)?.role
  return role === 'ADMIN' || role === 'COMMERCIAL'
}

function nextBilling(cycle: string, from: Date = new Date()): Date {
  if (cycle === 'QUARTERLY') return addQuarters(from, 1)
  if (cycle === 'ANNUAL') {
    const d = new Date(from)
    d.setFullYear(d.getFullYear() + 1)
    return d
  }
  return addMonths(from, 1) // MONTHLY
}

const createSchema = z.object({
  clientId:      z.string().min(1),
  profileType:   z.string(),
  planName:      z.string().min(2).max(120),
  currency:      z.string().default('BRL'),
  amount:        z.number().positive(),
  spendFeePct:   z.number().min(0).max(100).optional().nullable(),
  billingCycle:  z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']).default('MONTHLY'),
  gateway:       z.string().default('INTER'),
  notes:         z.string().optional().nullable(),
  externalPlanId: z.string().optional().nullable(),
  startedAt:     z.string().optional().nullable(),
})

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status      = searchParams.get('status') as SubscriptionStatus | null
  const profileType = searchParams.get('profileType') as ClientProfileType | null
  const clientId    = searchParams.get('clientId')

  const subs = await prisma.subscription.findMany({
    where: {
      ...(status      ? { status }      : {}),
      ...(profileType ? { profileType } : {}),
      ...(clientId    ? { clientId }    : {}),
    },
    include: {
      client: {
        select: {
          id: true,
          clientCode: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const result = subs.map((s) => ({
    id:             s.id,
    planName:       s.planName,
    profileType:    s.profileType,
    status:         s.status,
    currency:       s.currency,
    amount:         Number(s.amount),
    spendFeePct:    s.spendFeePct ? Number(s.spendFeePct) : null,
    billingCycle:   s.billingCycle,
    gateway:        s.gateway,
    startedAt:      s.startedAt,
    nextBillingAt:  s.nextBillingAt,
    cancelledAt:    s.cancelledAt,
    notes:          s.notes,
    clientId:       s.clientId,
    clientName:     s.client.user?.name ?? 'N/A',
    clientEmail:    s.client.user?.email ?? 'N/A',
    clientCode:     s.client.clientCode,
  }))

  return NextResponse.json(result)
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const body   = await req.json().catch(() => ({}))
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 })
  }

  const d = parsed.data
  const startDate  = d.startedAt ? new Date(d.startedAt) : new Date()
  const nextBillingAt = nextBilling(d.billingCycle, startDate)

  const sub = await prisma.subscription.create({
    data: {
      clientId:       d.clientId,
      profileType:    d.profileType as ClientProfileType,
      planName:       d.planName,
      currency:       d.currency,
      amount:         d.amount,
      spendFeePct:    d.spendFeePct ?? null,
      billingCycle:   d.billingCycle,
      gateway:        d.gateway,
      notes:          d.notes ?? null,
      externalPlanId: d.externalPlanId ?? null,
      startedAt:      startDate,
      nextBillingAt,
    },
  })

  // Atualiza nextBillingAt do ClientProfile também
  await prisma.clientProfile.update({
    where: { id: d.clientId },
    data: {
      monthlyFeeBrl: d.currency === 'BRL' ? d.amount : undefined,
      spendFeePct:   d.spendFeePct ?? undefined,
      nextBillingAt,
    },
  }).catch(() => {})

  return NextResponse.json({ ok: true, id: sub.id }, { status: 201 })
}
