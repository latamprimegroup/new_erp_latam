import { NextRequest, NextResponse } from 'next/server'
import { compare } from 'bcryptjs'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { getProductionConfig } from '@/lib/production-payment'

const bodySchema = z.object({
  password: z.string().min(1, 'Senha obrigatória para assinar'),
  productionAccountIds: z.array(z.string()).optional().default([]),
  productionG2Ids: z.array(z.string()).optional().default([]),
  /** Data da conferência (auditoria). */
  conferenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Só ADMIN/FINANCE: cria saques PENDING por produtor (valor por conta × quantidade conferida). */
  createWithdrawalBatch: z.boolean().optional().default(false),
})

/**
 * POST - Valida contas em lote. Exige confirmação da senha do gerente.
 * Atualiza validatedByManagerId e validatedAt (conta para pagamento).
 */
export async function POST(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'PRODUCTION_MANAGER', 'FINANCE'])
  if (!auth.ok) return auth.response
  const session = auth.session

  try {
    const body = await req.json()
    const {
      password,
      productionAccountIds,
      productionG2Ids,
      conferenceDate: conferenceDateRaw,
      createWithdrawalBatch,
    } = bodySchema.parse(body)

    const conferenceDate =
      conferenceDateRaw ?? new Date().toISOString().slice(0, 10)

    if (productionAccountIds.length === 0 && productionG2Ids.length === 0) {
      return NextResponse.json(
        { error: 'Informe ao menos um ID de conta para validar' },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user!.id },
      select: { passwordHash: true },
    })
    if (!user?.passwordHash) {
      return NextResponse.json(
        { error: 'Usuário sem senha configurada. Configure uma senha para assinar.' },
        { status: 400 }
      )
    }

    const valid = await compare(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 })
    }

    const canCreateWithdrawals =
      createWithdrawalBatch && ['ADMIN', 'FINANCE'].includes(session.user.role || '')

    const [accRows, g2Rows] = await Promise.all([
      productionAccountIds.length > 0
        ? prisma.productionAccount.findMany({
            where: {
              id: { in: productionAccountIds },
              status: 'APPROVED',
              validatedAt: null,
              deletedAt: null,
            },
            select: { id: true, producerId: true },
          })
        : Promise.resolve([]),
      productionG2Ids.length > 0
        ? prisma.productionG2.findMany({
            where: {
              id: { in: productionG2Ids },
              status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
              archivedAt: null,
              validatedAt: null,
              deletedAt: null,
            },
            select: { id: true, creatorId: true },
          })
        : Promise.resolve([]),
    ])

    const perProducer = new Map<string, number>()
    for (const a of accRows) {
      perProducer.set(a.producerId, (perProducer.get(a.producerId) ?? 0) + 1)
    }
    for (const g of g2Rows) {
      perProducer.set(g.creatorId, (perProducer.get(g.creatorId) ?? 0) + 1)
    }

    const now = new Date()
    const payConfig = canCreateWithdrawals ? await getProductionConfig() : null

    const result = await prisma.$transaction(async (tx) => {
      let accCount = 0
      let g2Count = 0

      if (productionAccountIds.length > 0) {
        const r = await tx.productionAccount.updateMany({
          where: {
            id: { in: productionAccountIds },
            status: 'APPROVED',
            validatedAt: null,
          },
          data: {
            validatedByManagerId: session.user!.id,
            validatedAt: now,
          },
        })
        accCount = r.count
      }

      if (productionG2Ids.length > 0) {
        const r = await tx.productionG2.updateMany({
          where: {
            id: { in: productionG2Ids },
            status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
            archivedAt: null,
            validatedAt: null,
          },
          data: {
            validatedByManagerId: session.user!.id,
            validatedAt: now,
          },
        })
        g2Count = r.count
      }

      const withdrawalsCreated: { userId: string; netValue: number; count: number }[] = []
      if (canCreateWithdrawals && payConfig && payConfig.valorPorConta > 0 && perProducer.size > 0) {
        for (const [producerId, count] of perProducer) {
          const net = count * payConfig.valorPorConta
          if (net <= 0) continue
          await tx.withdrawal.create({
            data: {
              userId: producerId,
              gateway: 'CONFERENCIA_DIARIA',
              value: new Prisma.Decimal(net),
              netValue: new Prisma.Decimal(net),
              risk: `Lote conferência ${conferenceDate} · ${count} conta(s) conferida(s). Completar no Financeiro.`,
            },
          })
          withdrawalsCreated.push({ userId: producerId, netValue: net, count })
        }
      }

      return { accCount, g2Count, withdrawalsCreated }
    })

    await audit({
      userId: session.user!.id,
      action: 'production_validated_by_manager',
      entity: 'ProductionValidation',
      entityId: undefined,
      details: {
        conferenceDate,
        productionAccountIds,
        productionG2Ids,
        validatedCount: result.accCount + result.g2Count,
        accountsCount: result.accCount,
        g2Count: result.g2Count,
        validatedByName: session.user.name ?? session.user.email,
        withdrawalBatch:
          result.withdrawalsCreated.length > 0
            ? { items: result.withdrawalsCreated }
            : createWithdrawalBatch && (!payConfig || payConfig.valorPorConta <= 0)
              ? { skipped: 'valor_por_conta_zero' }
              : undefined,
      },
    })

    if (result.withdrawalsCreated.length > 0) {
      await audit({
        userId: session.user!.id,
        action: 'withdrawal_batch_from_conference',
        entity: 'Withdrawal',
        entityId: undefined,
        details: {
          conferenceDate,
          items: result.withdrawalsCreated,
        },
      })
    }

    return NextResponse.json({
      ok: true,
      validated: {
        accounts: result.accCount,
        g2Items: result.g2Count,
        total: result.accCount + result.g2Count,
      },
      withdrawals: {
        created: result.withdrawalsCreated.length,
        items: result.withdrawalsCreated,
        skippedReason:
          createWithdrawalBatch && !['ADMIN', 'FINANCE'].includes(session.user.role || '')
            ? 'Somente ADMIN ou FINANCE podem gerar o lote de saque.'
            : createWithdrawalBatch && payConfig && payConfig.valorPorConta <= 0
              ? 'Configure produção_valor_por_conta para gerar valores de saque.'
              : undefined,
      },
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao validar' }, { status: 500 })
  }
}
