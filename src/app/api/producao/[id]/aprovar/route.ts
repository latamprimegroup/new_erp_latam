import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { notifyAdminsProductionAccountApproved } from '@/lib/notifications/admin-events'

const bodySchema = z.object({
  action: z.enum(['approve', 'reject', 'analyze']),
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

    // Ação: marcar em análise (apenas contas pendentes)
    if (action === 'analyze') {
      if (production.status !== 'PENDING') {
        return NextResponse.json({ error: 'Apenas contas pendentes podem ser marcadas em análise' }, { status: 400 })
      }
      await prisma.productionAccount.update({
        where: { id },
        data: { status: 'IN_ANALYSIS' },
      })
      await audit({
        userId: session.user.id,
        action: 'production_in_analysis',
        entity: 'ProductionAccount',
        entityId: id,
      })
      return NextResponse.json({ ok: true, status: 'IN_ANALYSIS' })
    }

    if (production.status !== 'PENDING' && production.status !== 'IN_ANALYSIS') {
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

    // approve: create StockAccount and link (transação para atomicidade)
    const stock = await prisma.$transaction(async (tx) => {
      const s = await tx.stockAccount.create({
        data: {
          platform: production.platform,
          type: production.type,
          source: 'PRODUCTION',
          status: 'AVAILABLE',
          purchasePrice: null,
          salePrice: null,
        },
      })
      await tx.productionAccount.update({
        where: { id },
        data: { status: 'APPROVED', stockAccountId: s.id },
      })
      return s
    })

    await audit({
      userId: session.user.id,
      action: 'production_approved',
      entity: 'ProductionAccount',
      entityId: id,
      details: { stockAccountId: stock.id },
    })

    notifyAdminsProductionAccountApproved(production.platform).catch(console.error)

    return NextResponse.json({ ok: true, status: 'APPROVED', stockAccountId: stock.id })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao processar' }, { status: 500 })
  }
}
