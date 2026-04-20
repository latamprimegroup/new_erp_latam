/**
 * POST — cria reposição já APROVADA se cliente for VIP/LTV alto e saldo de garantia OK (Inter).
 * Comercial / Entregas / Admin / Financeiro. Use dryRun para simular.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAutoVipRepositionIfEligible } from '@/lib/garantia-reposicao-vip'

export const runtime = 'nodejs'

const bodySchema = z.object({
  quantity: z.number().int().positive(),
  reason: z.enum(['BLOQUEIO', 'LIMITE_GASTO', 'ERRO_ESTRUTURAL', 'PROBLEMA_PERFIL', 'OUTRO']),
  reasonOther: z.string().optional(),
  dryRun: z.boolean().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'DELIVERER', 'COMMERCIAL', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id: deliveryId } = await params

  try {
    const body = await req.json()
    const data = bodySchema.parse(body)

    if (data.reason === 'OUTRO' && !data.reasonOther?.trim()) {
      return NextResponse.json({ error: 'Informe o motivo quando selecionar "Outro"' }, { status: 400 })
    }

    const result = await createAutoVipRepositionIfEligible({
      db: prisma,
      deliveryId,
      actorUserId: session.user.id,
      quantity: data.quantity,
      reason: data.reason,
      reasonOther: data.reasonOther,
      dryRun: data.dryRun,
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, verificacao: result.verificacao },
        { status: result.status }
      )
    }

    if (result.dryRun) {
      return NextResponse.json({ dryRun: true, verificacao: result.verificacao })
    }

    return NextResponse.json({
      reposition: result.reposition,
      verificacao: result.verificacao,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao registrar reposição VIP' }, { status: 500 })
  }
}
