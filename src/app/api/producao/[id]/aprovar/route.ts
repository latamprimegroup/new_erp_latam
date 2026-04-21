import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { approveProductionAccount } from '@/lib/production-approve'

const bodySchema = z.object({
  action: z.enum(['approve', 'reject', 'quarantine', 'dead']),
  rejectionReason: z.string().min(1).optional(),
  rejectionReasonCode: z.string().optional(), // DOC_INVALIDO, EMAIL_BLOQUEADO, CNPJ_INVALIDO, etc.
  quarantineHours: z.number().int().min(1).max(720).optional(), // horas de quarentena (até 30 dias)
  deadReason: z.string().min(1).optional(), // motivo da baixa por morte
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(['ADMIN', 'FINANCE'])
  if (!auth.ok) return auth.response
  const session = auth.session

  const { id } = await params
  try {
    const body = await req.json()
    const { action, rejectionReason, rejectionReasonCode, quarantineHours, deadReason } = bodySchema.parse(body)

    const production = await prisma.productionAccount.findFirst({
      where: { id, deletedAt: null },
      include: { producer: { select: { name: true } } },
    })
    if (!production) return NextResponse.json({ error: 'Produção não encontrada' }, { status: 404 })

    // Dead Switch: pode ser aplicado a qualquer conta ainda não entregue
    if (action === 'dead') {
      if (!deadReason?.trim()) {
        return NextResponse.json({ error: 'Motivo da baixa é obrigatório' }, { status: 400 })
      }
      if (['DELIVERED', 'DEAD'].includes(production.status)) {
        return NextResponse.json({ error: 'Conta já entregue ou já baixada' }, { status: 400 })
      }
      await prisma.productionAccount.update({
        where: { id },
        data: { status: 'DEAD', deadAt: new Date(), deadReason: deadReason.trim() },
      })
      await audit({
        userId: session.user.id,
        action: 'production_dead_switch',
        entity: 'ProductionAccount',
        entityId: id,
        details: { deadReason: deadReason.trim(), previousStatus: production.status },
      })
      return NextResponse.json({ ok: true, status: 'DEAD' })
    }

    // Quarentena: envia conta para período de estabilidade
    if (action === 'quarantine') {
      if (!['PENDING', 'UNDER_REVIEW'].includes(production.status)) {
        return NextResponse.json({ error: 'Conta já foi aprovada, rejeitada ou está em quarentena' }, { status: 400 })
      }
      const hours = quarantineHours ?? 48
      const quarantineUntil = new Date(Date.now() + hours * 60 * 60 * 1000)
      await prisma.productionAccount.update({
        where: { id },
        data: { status: 'QUARANTINE', quarantineUntil, quarantineHours: hours },
      })
      await audit({
        userId: session.user.id,
        action: 'production_quarantine',
        entity: 'ProductionAccount',
        entityId: id,
        details: { quarantineHours: hours, quarantineUntil },
      })
      return NextResponse.json({ ok: true, status: 'QUARANTINE', quarantineUntil })
    }

    if (!['PENDING', 'UNDER_REVIEW', 'QUARANTINE'].includes(production.status)) {
      return NextResponse.json({ error: 'Conta já foi aprovada ou rejeitada' }, { status: 400 })
    }

    if (action === 'reject') {
      if (!rejectionReason?.trim()) {
        return NextResponse.json({ error: 'Motivo da rejeição é obrigatório' }, { status: 400 })
      }
      await prisma.productionAccount.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectionReason: rejectionReason.trim(),
          rejectionReasonCode: rejectionReasonCode?.trim() || null,
        },
      })
      await audit({
        userId: session.user.id,
        action: 'production_rejected',
        entity: 'ProductionAccount',
        entityId: id,
        details: { reason: rejectionReason },
      })
      return NextResponse.json({ ok: true, status: 'REJECTED' })
    }

    // Gate: Google Ads exige ID externo antes de aprovar
    if (production.platform === 'GOOGLE_ADS' && !production.googleAdsCustomerId?.trim()) {
      return NextResponse.json(
        { error: 'ID do Google Ads (Customer ID) é obrigatório para aprovar esta conta' },
        { status: 400 }
      )
    }

    // Gate: quarentena ainda ativa
    if (production.quarantineUntil && production.quarantineUntil > new Date()) {
      const remaining = Math.ceil((production.quarantineUntil.getTime() - Date.now()) / (1000 * 60 * 60))
      return NextResponse.json(
        { error: `Conta em quarentena. Disponível para aprovação em ${remaining}h` },
        { status: 400 }
      )
    }

    const approved = await approveProductionAccount(id, session.user.id)
    if (!approved.ok) {
      if (approved.code === 'NOT_FOUND') {
        return NextResponse.json({ error: 'Produção não encontrada' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Conta já foi aprovada ou rejeitada' }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      status: 'APPROVED',
      stockAccountId: approved.stockAccountId,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao processar' }, { status: 500 })
  }
}
