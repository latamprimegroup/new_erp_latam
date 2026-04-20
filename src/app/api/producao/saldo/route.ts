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

  const [statementAtual, profile, withdrawals, prodExtrato, g2Extrato] = await Promise.all([
    prisma.producerMonthlyStatement.findUnique({
      where: {
        userId_month_year: {
          userId,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        },
      },
    }),
    prisma.producerProfile.findUnique({
      where: { userId },
      select: { pixKey: true },
    }),
    prisma.withdrawal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 36,
      select: {
        id: true,
        createdAt: true,
        netValue: true,
        status: true,
        gateway: true,
        accountId: true,
      },
    }),
    prisma.productionAccount.findMany({
      where: {
        producerId: userId,
        status: 'APPROVED',
        validatedAt: { not: null, gte: startOfMonth, lte: endOfMonth },
      },
      select: { id: true, validatedAt: true },
      orderBy: { validatedAt: 'desc' },
      take: 250,
    }),
    prisma.productionG2.findMany({
      where: {
        creatorId: userId,
        status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
        validatedAt: { not: null, gte: startOfMonth, lte: endOfMonth },
      },
      select: { id: true, validatedAt: true },
      orderBy: { validatedAt: 'desc' },
      take: 250,
    }),
  ])

  const valorUnit = config.valorPorConta
  const extratoMes = [
    ...prodExtrato.map((r) => ({
      id: r.id,
      source: 'PRODUCTION' as const,
      validatedAt: r.validatedAt!.toISOString(),
      valorVariavelConta: valorUnit,
    })),
    ...g2Extrato.map((r) => ({
      id: r.id,
      source: 'G2' as const,
      validatedAt: r.validatedAt!.toISOString(),
      valorVariavelConta: valorUnit,
    })),
  ].sort((a, b) => b.validatedAt.localeCompare(a.validatedAt))

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
          closedAt: statementAtual.closedAt?.toISOString() ?? null,
        }
      : null,
    pixKey: profile?.pixKey ?? null,
    withdrawals: withdrawals.map((w) => ({
      id: w.id,
      createdAt: w.createdAt.toISOString(),
      netValue: Number(w.netValue),
      status: w.status,
      gateway: w.gateway,
      accountId: w.accountId,
    })),
    config: {
      metaDiaria: config.metaDiaria,
      metaMensal: config.metaMensal,
      metaElite: config.metaElite,
      salarioBase: config.salarioBase,
      valorPorConta: config.valorPorConta,
      bonusNivel1: config.bonusNivel1,
      bonusNivel2: config.bonusNivel2,
      bonusNivel3: config.bonusNivel3,
      bonusMax: config.bonusMax,
      bonusElite: config.bonusElite,
    },
    extratoMes,
  })
}
