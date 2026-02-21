import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import {
  getPlugPlayAvailableBalance,
  getPlugPlayConfig,
  calculateMonthlyAmount,
} from '@/lib/plugplay-payment'
import { prisma } from '@/lib/prisma'

/**
 * Retorna saldo disponível para saque + previsão do mês (Plug & Play)
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const userId = session.user?.id
  if (!userId) return NextResponse.json({ error: 'Usuário não identificado' }, { status: 401 })

  const isPlugPlay = session.user?.role === 'PLUG_PLAY'
  const isAdmin = session.user?.role === 'ADMIN'
  if (!isPlugPlay && !isAdmin) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const collaboratorId = userId

  const config = await getPlugPlayConfig()
  const saldoDisponivel = await getPlugPlayAvailableBalance(collaboratorId)

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const accountsSurvivedMonth = await prisma.blackOperation.count({
    where: {
      collaboratorId,
      status: 'SURVIVED_24H',
      updatedAt: { gte: startOfMonth, lte: endOfMonth },
    },
  })

  const previsaoMes = calculateMonthlyAmount(accountsSurvivedMonth, config)

  const statementAtual = await prisma.plugPlayMonthlyStatement.findUnique({
    where: {
      collaboratorId_month_year: {
        collaboratorId,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      },
    },
  })

  return NextResponse.json({
    saldoDisponivel,
    previsaoMes: {
      contasSurvived24h: accountsSurvivedMonth,
      baseSalary: previsaoMes.baseSalary,
      bonusTotal: previsaoMes.bonusTotal,
      total: previsaoMes.total,
      tier: previsaoMes.tier,
    },
    fechamentoAtual: statementAtual
      ? {
          status: statementAtual.status,
          total: Number(statementAtual.totalAmount),
          tier: statementAtual.tier,
        }
      : null,
    config: {
      salarioBase: config.salarioBase,
      metaDiaria: config.metaDiaria,
      metaMensal: config.metaMensal,
      metaElite: config.metaElite,
    },
  })
}
