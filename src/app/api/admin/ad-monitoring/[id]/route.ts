/**
 * PATCH /api/admin/ad-monitoring/[id] — Atualiza gasto diário / mensal (entrada manual)
 * DELETE /api/admin/ad-monitoring/[id] — Desativa monitoramento
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { startOfDay } from 'date-fns'

function isAdmin(s: Awaited<ReturnType<typeof getServerSession>>) {
  return ['ADMIN', 'COMMERCIAL'].includes((s?.user as { role?: string } | undefined)?.role ?? '')
}

const patchSchema = z.object({
  /** Gasto registrado para o dia (em BRL) */
  dailySpendBrl:     z.number().min(0).optional(),
  dailySpendUsd:     z.number().min(0).optional(),
  commissionRatePct: z.number().min(0).max(100).optional(),
  adAccountName:     z.string().max(200).optional().nullable(),
  notes:             z.string().max(500).optional().nullable(),
  active:            z.boolean().optional(),
  /** Câmbio usado na conversão */
  fxRateUsd:         z.number().positive().optional(),
  /** Data do registro (default: hoje) */
  date:              z.string().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const body   = await req.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

  const d = parsed.data

  const account = await prisma.adAccountMonitoring.findUnique({
    where:  { id: params.id },
    select: { commissionRatePct: true, monthlySpendBrl: true, totalSpendBrl: true },
  })
  if (!account) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })

  const commRate = d.commissionRatePct ?? Number(account.commissionRatePct)

  // Atualiza a conta
  const updateData: Record<string, unknown> = {
    lastSyncAt: new Date(),
    ...(d.commissionRatePct !== undefined ? { commissionRatePct: d.commissionRatePct } : {}),
    ...(d.adAccountName  !== undefined    ? { adAccountName: d.adAccountName }          : {}),
    ...(d.notes          !== undefined    ? { notes: d.notes }                           : {}),
    ...(d.active         !== undefined    ? { active: d.active }                         : {}),
    ...(d.fxRateUsd      !== undefined    ? { lastFxRateUsd: d.fxRateUsd }              : {}),
  }

  if (d.dailySpendBrl !== undefined) {
    updateData.dailySpendBrl   = d.dailySpendBrl
    updateData.monthlySpendBrl = Number(account.monthlySpendBrl) + d.dailySpendBrl
    updateData.totalSpendBrl   = Number(account.totalSpendBrl)   + d.dailySpendBrl
  }
  if (d.dailySpendUsd !== undefined) {
    updateData.dailySpendUsd = d.dailySpendUsd
  }

  await prisma.adAccountMonitoring.update({ where: { id: params.id }, data: updateData })

  // Grava log diário se gasto foi informado
  if (d.dailySpendBrl !== undefined && d.dailySpendBrl > 0) {
    const logDate  = d.date ? startOfDay(new Date(d.date)) : startOfDay(new Date())
    const commBrl  = d.dailySpendBrl * commRate / 100

    await prisma.adSpendLog.upsert({
      where:  { monitoringId_date: { monitoringId: params.id, date: logDate } },
      update: {
        spendBrl:      d.dailySpendBrl,
        spendUsd:      d.dailySpendUsd ?? 0,
        fxRateUsd:     d.fxRateUsd ?? null,
        commissionBrl: commBrl,
      },
      create: {
        monitoringId: params.id,
        date:         logDate,
        spendBrl:     d.dailySpendBrl,
        spendUsd:     d.dailySpendUsd ?? 0,
        fxRateUsd:    d.fxRateUsd ?? null,
        commissionBrl: commBrl,
        source:        'MANUAL',
      },
    })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  await prisma.adAccountMonitoring.update({
    where: { id: params.id },
    data:  { active: false },
  }).catch(() => null)

  return NextResponse.json({ ok: true })
}
