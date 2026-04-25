/**
 * GET  /api/admin/ad-monitoring — Lista contas monitoradas
 * POST /api/admin/ad-monitoring — Adiciona conta para monitorar
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

function isAdmin(s: Awaited<ReturnType<typeof getServerSession>>) {
  return ['ADMIN', 'COMMERCIAL'].includes((s?.user as { role?: string } | undefined)?.role ?? '')
}

const createSchema = z.object({
  clientId:          z.string().min(1),
  platform:          z.string().min(1).max(40),
  adAccountId:       z.string().min(1).max(60),
  adAccountName:     z.string().max(200).optional().nullable(),
  commissionRatePct: z.number().min(0).max(100),
  notes:             z.string().max(500).optional().nullable(),
})

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  const platform = searchParams.get('platform')
  const active   = searchParams.get('active')

  const accounts = await prisma.adAccountMonitoring.findMany({
    where: {
      ...(clientId ? { clientId }             : {}),
      ...(platform ? { platform }             : {}),
      ...(active !== null ? { active: active === 'true' } : { active: true }),
    },
    include: {
      client: {
        select: {
          id:         true,
          clientCode: true,
          profileType: true,
          user: { select: { name: true, email: true } },
        },
      },
      _count: { select: { spendLogs: true } },
    },
    orderBy: { monthlySpendBrl: 'desc' },
    take:    500,
  })

  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

  return NextResponse.json(accounts.map((a) => {
    const commBrl = Number(a.monthlySpendBrl) * Number(a.commissionRatePct) / 100
    return {
      id:                a.id,
      platform:          a.platform,
      adAccountId:       a.adAccountId,
      adAccountName:     a.adAccountName,
      dailySpendBrl:     Number(a.dailySpendBrl),
      dailySpendUsd:     Number(a.dailySpendUsd),
      monthlySpendBrl:   Number(a.monthlySpendBrl),
      totalSpendBrl:     Number(a.totalSpendBrl),
      commissionRatePct: Number(a.commissionRatePct),
      commissionDueBrl:  Math.round(commBrl * 100) / 100,
      lastSyncAt:        a.lastSyncAt,
      active:            a.active,
      notes:             a.notes,
      logCount:          a._count.spendLogs,
      client: {
        id:          a.client.id,
        clientCode:  a.client.clientCode,
        name:        a.client.user?.name ?? 'N/A',
        email:       a.client.user?.email ?? 'N/A',
        profileType: a.client.profileType,
      },
    }
  }))
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
  const account = await prisma.adAccountMonitoring.create({
    data: {
      clientId:          d.clientId,
      platform:          d.platform,
      adAccountId:       d.adAccountId,
      adAccountName:     d.adAccountName ?? null,
      commissionRatePct: d.commissionRatePct,
      notes:             d.notes ?? null,
    },
  }).catch((e) => {
    if ((e as { code?: string }).code === 'P2002') return null
    throw e
  })

  if (!account) {
    return NextResponse.json({ error: 'Esta conta já está sendo monitorada para este cliente' }, { status: 409 })
  }

  return NextResponse.json({ ok: true, id: account.id }, { status: 201 })
}
