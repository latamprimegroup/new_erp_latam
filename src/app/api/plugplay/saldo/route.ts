import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import {
  getPlugPlayAvailableBalance,
  getPlugPlayConfig,
  calculateMonthlyAmount,
} from '@/lib/plugplay-payment'
import { prisma } from '@/lib/prisma'
import { getPlugPlayUnitPrices, pickPlugPlayUnit } from '@/lib/black-payment'
import {
  PLUG_PLAY_MIN_WITHDRAWAL_BRL,
  isPlugPlayWithdrawalPeriodOpen,
} from '@/lib/plugplay-withdrawal-rules'

const MS_24H = 24 * 60 * 60 * 1000

function hoursLiveToBan(wentLiveAt: Date, bannedAt: Date): number {
  return (bannedAt.getTime() - wentLiveAt.getTime()) / (1000 * 60 * 60)
}

/**
 * Saldo, previsão, extrato por conta e regras de saque — Plug & Play.
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
  const now = new Date()
  const nowMs = now.getTime()

  const [config, saldoDisponivel, prices, operations, withdrawals, statementAtual] = await Promise.all([
    getPlugPlayConfig(),
    getPlugPlayAvailableBalance(collaboratorId),
    getPlugPlayUnitPrices(),
    prisma.blackOperation.findMany({
      where: { collaboratorId },
      include: { payment: true },
      orderBy: { createdAt: 'desc' },
      take: 150,
    }),
    prisma.withdrawal.findMany({
      where: { userId: collaboratorId },
      orderBy: { createdAt: 'desc' },
      take: 24,
      select: {
        id: true,
        createdAt: true,
        netValue: true,
        status: true,
        gateway: true,
        accountId: true,
      },
    }),
    prisma.plugPlayMonthlyStatement.findUnique({
      where: {
        collaboratorId_month_year: {
          collaboratorId,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        },
      },
    }),
  ])

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const accountsSurvivedMonth = await prisma.blackOperation.count({
    where: {
      collaboratorId,
      status: 'SURVIVED_24H',
      updatedAt: { gte: startOfMonth, lte: endOfMonth },
    },
  })

  const setupsComSucessoTotal = await prisma.blackOperation.count({
    where: { collaboratorId, status: 'SURVIVED_24H' },
  })

  const previsaoMes = calculateMonthlyAmount(accountsSurvivedMonth, config)

  let contasEmAnalise = 0
  let somaUnidadesEmAnalise = 0
  for (const o of operations) {
    if (o.status !== 'LIVE' || !o.wentLiveAt) continue
    const liveMs = new Date(o.wentLiveAt).getTime()
    if (nowMs - liveMs < MS_24H) {
      contasEmAnalise++
      somaUnidadesEmAnalise += pickPlugPlayUnit(prices, o.platform)
    }
  }

  const previsaoGanhosRapida = saldoDisponivel + somaUnidadesEmAnalise

  const saquePeriodoAberto = await isPlugPlayWithdrawalPeriodOpen()
  const podeSolicitarSaque =
    saldoDisponivel >= PLUG_PLAY_MIN_WITHDRAWAL_BRL && saquePeriodoAberto && saldoDisponivel > 0

  const extrato = operations.map((o) => {
    const unit = pickPlugPlayUnit(prices, o.platform)
    const platformLabel =
      o.platform === 'FACEBOOK' ? 'Facebook' : o.platform === 'GOOGLE_ADS' ? 'Google Ads' : '—'
    const setupDate = (o.wentLiveAt ?? o.createdAt).toISOString()

    let rowStatus: 'SUCESSO' | 'EM_ANALISE' | 'QUEDA_TECNICA' | 'EM_SETUP' | 'BANIDA' | 'AGUARDANDO_24H'
    let valorComissao = 0
    let pendente = false
    let notaValor: string | null = null

    if (o.status === 'SURVIVED_24H') {
      rowStatus = 'SUCESSO'
      valorComissao = o.payment ? Number(o.payment.amount) : unit
      notaValor = o.payment?.status === 'PENDING' ? 'Pendente financeiro' : null
    } else if (o.status === 'LIVE' && o.wentLiveAt) {
      const liveMs = new Date(o.wentLiveAt).getTime()
      if (nowMs - liveMs < MS_24H) {
        rowStatus = 'EM_ANALISE'
        valorComissao = unit
        pendente = true
        notaValor = 'Pendente'
      } else {
        rowStatus = 'AGUARDANDO_24H'
        valorComissao = unit
        pendente = true
        notaValor = 'Aguardando janela +24h'
      }
    } else if (o.status === 'BANNED') {
      if (o.wentLiveAt && o.bannedAt && hoursLiveToBan(new Date(o.wentLiveAt), new Date(o.bannedAt)) < 24) {
        rowStatus = 'QUEDA_TECNICA'
        valorComissao = 0
      } else {
        rowStatus = 'BANIDA'
        valorComissao = 0
      }
    } else {
      rowStatus = 'EM_SETUP'
      valorComissao = 0
    }

    return {
      id: o.id,
      displayId: `#ads-${o.id.slice(-4)}`,
      platform: platformLabel,
      platformCode: o.platform,
      dataSetup: setupDate,
      rowStatus,
      valorComissao,
      pendente,
      notaValor,
      technicalBanReason: o.technicalBanReason,
    }
  })

  return NextResponse.json({
    saldoDisponivel,
    setupsComSucesso: setupsComSucessoTotal,
    previsaoGanhosRapida,
    previsaoMes: {
      contasSurvived24h: accountsSurvivedMonth,
      baseSalary: previsaoMes.baseSalary,
      bonusTotal: previsaoMes.bonusTotal,
      total: previsaoMes.total,
      tier: previsaoMes.tier,
    },
    contasEmAnalise,
    valoresUnitarios: {
      googleAds: prices.google,
      facebook: prices.facebook,
      legadoFallback: prices.fallback,
    },
    performance: {
      tier: previsaoMes.tier,
      metaPadraoContas: config.metaMensal,
      metaEliteContas: config.metaElite,
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
    saque: {
      minimoReais: PLUG_PLAY_MIN_WITHDRAWAL_BRL,
      periodoAberto: saquePeriodoAberto,
      podeSolicitar: podeSolicitarSaque,
    },
    extrato,
    withdrawals: withdrawals.map((w) => ({
      id: w.id,
      createdAt: w.createdAt.toISOString(),
      netValue: Number(w.netValue),
      status: w.status,
      gateway: w.gateway,
      accountId: w.accountId,
    })),
  })
}
