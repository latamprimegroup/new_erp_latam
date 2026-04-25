/**
 * GET  /api/admin/plans — Lista todos os planos do catálogo
 * POST /api/admin/plans — Cria novo plano
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import type { ClientProfileType } from '@prisma/client'

function isAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  const role = (session?.user as { role?: string } | undefined)?.role
  return role === 'ADMIN' || role === 'COMMERCIAL'
}

const planSchema = z.object({
  name:           z.string().min(2).max(120),
  description:    z.string().max(500).optional().nullable(),
  slug:           z.string().min(2).max(100).regex(/^[a-z0-9-]+$/, 'Apenas letras minúsculas, números e hífens'),
  profileType:    z.string(),
  priceBrl:       z.number().positive().optional().nullable(),
  priceUsd:       z.number().positive().optional().nullable(),
  interval:       z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']).default('MONTHLY'),
  trialDays:      z.number().int().min(0).default(0),
  spendFeePct:    z.number().min(0).max(100).optional().nullable(),
  features:       z.array(z.string()).default([]),
  active:         z.boolean().default(true),
})

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const active     = searchParams.get('active')
  const profileType = searchParams.get('profileType')

  const plans = await prisma.plan.findMany({
    where: {
      ...(active      !== null ? { active: active === 'true' }               : {}),
      ...(profileType           ? { profileType: profileType as ClientProfileType } : {}),
    },
    include: {
      _count: { select: { subscriptions: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(plans.map((p) => ({
    id:              p.id,
    slug:            p.slug,
    name:            p.name,
    description:     p.description,
    profileType:     p.profileType,
    priceBrl:        p.priceBrl ? Number(p.priceBrl) : null,
    priceUsd:        p.priceUsd ? Number(p.priceUsd) : null,
    interval:        p.interval,
    trialDays:       p.trialDays,
    spendFeePct:     p.spendFeePct ? Number(p.spendFeePct) : null,
    features:        Array.isArray(p.features) ? p.features : [],
    active:          p.active,
    subscriptions:   p._count.subscriptions,
    createdAt:       p.createdAt,
  })))
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const body   = await req.json().catch(() => ({}))
  const parsed = planSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 })
  }

  const d = parsed.data
  const plan = await prisma.plan.create({
    data: {
      name:        d.name,
      description: d.description ?? null,
      slug:        d.slug,
      profileType: d.profileType as ClientProfileType,
      priceBrl:    d.priceBrl ?? null,
      priceUsd:    d.priceUsd ?? null,
      interval:    d.interval,
      trialDays:   d.trialDays,
      spendFeePct: d.spendFeePct ?? null,
      features:    d.features,
      active:      d.active,
    },
  })

  return NextResponse.json({ ok: true, id: plan.id, slug: plan.slug }, { status: 201 })
}
