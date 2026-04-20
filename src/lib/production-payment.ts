/**
 * Cálculo de pagamento para produtores — persistência e fechamento mensal.
 */

import { prisma } from './prisma'
import {
  type ProductionPaymentConfig,
  DEFAULT_PRODUCTION_PAYMENT_CONFIG,
  calculateMonthlyAmount,
} from './production-bonus-math'

export { calculateMonthlyAmount, calculateBonus, getBonusTier } from './production-bonus-math'
export type { ProductionPaymentConfig, BonusTier } from './production-bonus-math'

/** @deprecated use DEFAULT_PRODUCTION_PAYMENT_CONFIG */
export const DEFAULT_CONFIG = DEFAULT_PRODUCTION_PAYMENT_CONFIG

export async function getProductionConfig(): Promise<ProductionPaymentConfig> {
  const settings = await prisma.systemSetting.findMany({
    where: {
      key: {
        in: [
          'producao_salario_base',
          'producao_meta_diaria',
          'producao_meta_mensal',
          'producao_meta_elite',
          'producao_valor_por_conta',
          'producao_bonus_200',
          'producao_bonus_250',
          'producao_bonus_300',
          'producao_bonus_330',
          'producao_bonus_600',
        ],
      },
    },
  })
  const m = Object.fromEntries(settings.map((s) => [s.key, s.value]))
  return {
    salarioBase: parseInt(m.producao_salario_base || String(DEFAULT_PRODUCTION_PAYMENT_CONFIG.salarioBase), 10),
    metaDiaria: parseInt(m.producao_meta_diaria || String(DEFAULT_PRODUCTION_PAYMENT_CONFIG.metaDiaria), 10),
    metaMensal: parseInt(m.producao_meta_mensal || String(DEFAULT_PRODUCTION_PAYMENT_CONFIG.metaMensal), 10),
    metaElite: parseInt(m.producao_meta_elite || String(DEFAULT_PRODUCTION_PAYMENT_CONFIG.metaElite), 10),
    valorPorConta: parseFloat(
      m.producao_valor_por_conta || String(DEFAULT_PRODUCTION_PAYMENT_CONFIG.valorPorConta)
    ),
    bonusNivel1: parseInt(m.producao_bonus_200 || String(DEFAULT_PRODUCTION_PAYMENT_CONFIG.bonusNivel1), 10),
    bonusNivel2: parseInt(m.producao_bonus_250 || String(DEFAULT_PRODUCTION_PAYMENT_CONFIG.bonusNivel2), 10),
    bonusNivel3: parseInt(m.producao_bonus_300 || String(DEFAULT_PRODUCTION_PAYMENT_CONFIG.bonusNivel3), 10),
    bonusMax: parseInt(m.producao_bonus_330 || String(DEFAULT_PRODUCTION_PAYMENT_CONFIG.bonusMax), 10),
    bonusElite: parseInt(m.producao_bonus_600 || String(DEFAULT_PRODUCTION_PAYMENT_CONFIG.bonusElite), 10),
  }
}

export async function getProducerAvailableBalance(userId: string): Promise<number> {
  const closed = await prisma.producerMonthlyStatement.findMany({
    where: { userId, status: 'CLOSED' },
  })
  const totalCredited = closed.reduce((s, st) => s + Number(st.totalAmount), 0)

  const withdrawals = await prisma.withdrawal.findMany({
    where: { userId, status: { in: ['PENDING', 'PROCESSING', 'COMPLETED', 'HELD'] } },
  })
  const totalWithdrawn = withdrawals.reduce((s, w) => s + Number(w.netValue), 0)

  return Math.max(0, totalCredited - totalWithdrawn)
}

export async function closeMonthForProducer(userId: string, month: number, year: number, closedById: string) {
  const config = await getProductionConfig()
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59)

  const [prodCount, g2Count] = await Promise.all([
    prisma.productionAccount.count({
      where: {
        producerId: userId,
        status: 'APPROVED',
        validatedAt: { not: null, gte: start, lte: end },
      },
    }),
    prisma.productionG2.count({
      where: {
        creatorId: userId,
        status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
        validatedAt: { not: null, gte: start, lte: end },
      },
    }),
  ])
  const accountsApproved = prodCount + g2Count

  const { baseSalary, perAccountTotal, bonusTotal, total } = calculateMonthlyAmount(accountsApproved, config)

  const st = await prisma.producerMonthlyStatement.upsert({
    where: {
      userId_month_year: { userId, month, year },
    },
    create: {
      userId,
      month,
      year,
      accountsApproved,
      baseSalary,
      perAccountTotal,
      bonusTotal,
      totalAmount: total,
      status: 'CLOSED',
      closedAt: new Date(),
      closedById,
    },
    update: {
      accountsApproved,
      baseSalary,
      perAccountTotal,
      bonusTotal,
      totalAmount: total,
      status: 'CLOSED',
      closedAt: new Date(),
      closedById,
    },
  })
  return st
}
