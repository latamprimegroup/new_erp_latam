import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { approveProductionAccount } from '@/lib/production-approve'

const bodySchema = z.object({
  action: z.enum(['approve', 'reject']),
  rejectionReason: z.string().min(1).optional(),
  rejectionReasonCode: z.string().optional(), // DOC_INVALIDO, EMAIL_BLOQUEADO, CNPJ_INVALIDO, etc.
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
    const { action, rejectionReason, rejectionReasonCode } = bodySchema.parse(body)

    const production = await prisma.productionAccount.findFirst({
      where: { id, deletedAt: null },
      include: { producer: { select: { name: true } } },
    })
    if (!production) return NextResponse.json({ error: 'Produção não encontrada' }, { status: 404 })
    if (!['PENDING', 'UNDER_REVIEW'].includes(production.status)) {
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
