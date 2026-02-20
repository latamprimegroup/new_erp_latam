import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getProducerAvailableBalance } from '@/lib/production-payment'
import { getPlugPlayAvailableBalance } from '@/lib/plugplay-payment'

const schema = z.object({
  value: z.number().positive(),
  gateway: z.string().min(1),
  accountId: z.string().optional(),
})

/**
 * Produtor solicita saque do saldo disponível (baseado em fechamentos mensais)
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const userId = session.user?.id
  if (!userId) return NextResponse.json({ error: 'Usuário não identificado' }, { status: 401 })

  const roles = ['ADMIN', 'PRODUCER', 'PLUG_PLAY']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão para solicitar saque' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { value, gateway, accountId } = schema.parse(body)

    const saldo =
      session.user.role === 'PLUG_PLAY'
        ? await getPlugPlayAvailableBalance(userId)
        : await getProducerAvailableBalance(userId)
    if (value > saldo) {
      return NextResponse.json(
        { error: `Saldo insuficiente. Disponível: R$ ${saldo.toLocaleString('pt-BR')}` },
        { status: 400 }
      )
    }

    const withdrawal = await prisma.withdrawal.create({
      data: {
        userId,
        gateway,
        accountId: accountId || null,
        value,
        netValue: value,
        status: 'PENDING',
      },
    })

    return NextResponse.json(withdrawal)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    throw e
  }
}
