import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import {
  getProducerAvailableBalance,
  getProductionConfig,
  calculateMonthlyAmount,
} from '@/lib/production-payment'
import { prisma } from '@/lib/prisma'

/**
 * Retorna saldo disponível para saque + previsão do mês atual
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const userId = session.user?.id
  if (!userId) return NextResponse.json({ error: 'Usuário não identificado' }, { status: 401 })

  const roles = ['ADMIN', 'PRODUCER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const config = await getProductionConfig()
  const saldoDisponivel = await getProducerAvailableBalance(userId)

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const [prodValidated, g2Validated] = await Promise.all([
    prisma.productionAccount.count({
      where: {
        producerId: userId,
        status: 'APPROVED',
        validatedAt: { not: null, gte: startOfMonth, lte: endOfMonth },
      },
    }),
    prisma.productionG2.count({
      where: {
        creatorId: userId,
        status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
        validatedAt: { not: null, gte: startOfMonth, lte: endOfMonth },
      },
    }),
  ])
  const accountsApprovedMonth = prodValidated + g2Validated

  const previsaoMes = calculateMonthlyAmount(accountsApprovedMonth, config)

  const statementAtual = await prisma.producerMonthlyStatement.findUnique({
    where: {
      userId_month_year: {
        userId,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      },
    },
  })

  return NextResponse.json({
    saldoDisponivel,
    previsaoMes: {
      contasAprovadas: accountsApprovedMonth,
      baseSalary: previsaoMes.baseSalary,
      perAccountTotal: previsaoMes.perAccountTotal,
      bonusTotal: previsaoMes.bonusTotal,
      total: previsaoMes.total,
    },
    fechamentoAtual: statementAtual
      ? {
          status: statementAtual.status,
          total: Number(statementAtual.totalAmount),
        }
      : null,
    config: {
      metaDiaria: config.metaDiaria,
      metaMensal: config.metaMensal,
      metaElite: config.metaElite,
      salarioBase: config.salarioBase,
    },
  })
}
