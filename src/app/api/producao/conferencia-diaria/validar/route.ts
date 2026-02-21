import { NextRequest, NextResponse } from 'next/server'
import { compare } from 'bcryptjs'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

const bodySchema = z.object({
  password: z.string().min(1, 'Senha obrigatória para assinar'),
  productionAccountIds: z.array(z.string()).optional().default([]),
  productionG2Ids: z.array(z.string()).optional().default([]),
})

/**
 * POST - Valida contas em lote. Exige confirmação da senha do gerente.
 * Atualiza validatedByManagerId e validatedAt (conta para pagamento).
 */
export async function POST(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response
  const session = auth.session

  try {
    const body = await req.json()
    const { password, productionAccountIds, productionG2Ids } = bodySchema.parse(body)

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

    const now = new Date()
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

      return { accCount, g2Count }
    })

    await audit({
      userId: session.user!.id,
      action: 'production_validated_by_manager',
      entity: 'ProductionValidation',
      entityId: undefined,
      details: {
        productionAccountIds,
        productionG2Ids,
        validatedCount: result.accCount + result.g2Count,
        accountsCount: result.accCount,
        g2Count: result.g2Count,
      },
    })

    return NextResponse.json({
      ok: true,
      validated: {
        accounts: result.accCount,
        g2Items: result.g2Count,
        total: result.accCount + result.g2Count,
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
