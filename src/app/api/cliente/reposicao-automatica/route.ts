/**
 * POST — Self-service: reposição automática (mesma regra VIP + garantia) para o próprio cliente.
 * O usuário deve ser dono do grupo de entrega (clientId).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAutoVipRepositionIfEligible } from '@/lib/garantia-reposicao-vip'
import { isGlobalKillSwitchActive } from '@/lib/kill-switch'

export const runtime = 'nodejs'

const bodySchema = z.object({
  deliveryGroupId: z.string().min(1),
  quantity: z.number().int().positive(),
  reason: z.enum(['BLOQUEIO', 'LIMITE_GASTO', 'ERRO_ESTRUTURAL', 'PROBLEMA_PERFIL', 'OUTRO']),
  reasonOther: z.string().optional(),
  dryRun: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })

  if (await isGlobalKillSwitchActive()) {
    return NextResponse.json(
      { error: 'Sistema em pausa operacional. Tente novamente mais tarde.' },
      { status: 503 }
    )
  }

  try {
    const body = await req.json()
    const data = bodySchema.parse(body)

    if (data.reason === 'OUTRO' && !data.reasonOther?.trim()) {
      return NextResponse.json({ error: 'Informe o motivo quando selecionar "Outro"' }, { status: 400 })
    }

    const delivery = await prisma.deliveryGroup.findFirst({
      where: { id: data.deliveryGroupId, clientId: client.id },
      select: { id: true },
    })
    if (!delivery) {
      return NextResponse.json({ error: 'Entrega não encontrada' }, { status: 404 })
    }

    const result = await createAutoVipRepositionIfEligible({
      db: prisma,
      deliveryId: data.deliveryGroupId,
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
    return NextResponse.json({ error: 'Erro ao solicitar reposição' }, { status: 500 })
  }
}
