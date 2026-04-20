import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getProducerAvailableBalance } from '@/lib/production-payment'
import { getPlugPlayAvailableBalance } from '@/lib/plugplay-payment'
import {
  PLUG_PLAY_MIN_WITHDRAWAL_BRL,
  isPlugPlayWithdrawalPeriodOpen,
} from '@/lib/plugplay-withdrawal-rules'

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
    let { value, gateway, accountId } = schema.parse(body)

    if (session.user.role === 'PRODUCER' && gateway === 'PIX' && !accountId?.trim()) {
      const prof = await prisma.producerProfile.findUnique({
        where: { userId },
        select: { pixKey: true },
      })
      const k = prof?.pixKey?.trim()
      if (k) accountId = k
    }

    const saldo =
      session.user.role === 'PLUG_PLAY'
        ? await getPlugPlayAvailableBalance(userId)
        : await getProducerAvailableBalance(userId)

    if (session.user.role === 'PLUG_PLAY') {
      if (value < PLUG_PLAY_MIN_WITHDRAWAL_BRL) {
        return NextResponse.json(
          { error: `Valor mínimo para saque Plug & Play: R$ ${PLUG_PLAY_MIN_WITHDRAWAL_BRL.toFixed(2).replace('.', ',')}` },
          { status: 400 }
        )
      }
      const periodo = await isPlugPlayWithdrawalPeriodOpen()
      if (!periodo) {
        return NextResponse.json(
          {
            error:
              'Saque fora do período liberado. Entre em contato com o financeiro ou aguarde a janela mensal (configurável).',
          },
          { status: 400 }
        )
      }
    }

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
        accountId: accountId?.trim() || null,
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
