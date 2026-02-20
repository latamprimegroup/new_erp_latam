/**
 * Cálculo de pagamento para produtores
 * Meta padrão: 330 contas (R$ 5.000 bônus máx)
 * Meta elite: 600 contas (R$ 10.000 bônus)
 * Salário base: R$ 1.500/mês
 */

import { prisma } from './prisma'

export const DEFAULT_CONFIG = {
  salarioBase: 1500,
  metaDiaria: 15,
  metaMensal: 330,
  metaElite: 600,
  valorPorConta: 0, // Valor extra por conta aprovada (configurável)
  bonusNivel1: 1000,   // 200 contas
  bonusNivel2: 2000,   // 250 contas
  bonusNivel3: 3000,   // 300 contas
  bonusMax: 5000,      // 330 contas (meta oficial)
  bonusElite: 10000,   // 600 contas (meta elite)
}

export async function getProductionConfig() {
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
    salarioBase: parseInt(m.producao_salario_base || String(DEFAULT_CONFIG.salarioBase), 10),
    metaDiaria: parseInt(m.producao_meta_diaria || String(DEFAULT_CONFIG.metaDiaria), 10),
    metaMensal: parseInt(m.producao_meta_mensal || String(DEFAULT_CONFIG.metaMensal), 10),
    metaElite: parseInt(m.producao_meta_elite || String(DEFAULT_CONFIG.metaElite), 10),
    valorPorConta: parseFloat(m.producao_valor_por_conta || String(DEFAULT_CONFIG.valorPorConta)),
    bonusNivel1: parseInt(m.producao_bonus_200 || String(DEFAULT_CONFIG.bonusNivel1), 10),
    bonusNivel2: parseInt(m.producao_bonus_250 || String(DEFAULT_CONFIG.bonusNivel2), 10),
    bonusNivel3: parseInt(m.producao_bonus_300 || String(DEFAULT_CONFIG.bonusNivel3), 10),
    bonusMax: parseInt(m.producao_bonus_330 || String(DEFAULT_CONFIG.bonusMax), 10),
    bonusElite: parseInt(m.producao_bonus_600 || String(DEFAULT_CONFIG.bonusElite), 10),
  }
}

export type BonusTier = 0 | 1 | 2 | 3 | 4 | 5 // 0=nada, 1=200, 2=250, 3=300, 4=330, 5=600

export function getBonusTier(accountsApproved: number, config: Awaited<ReturnType<typeof getProductionConfig>>): BonusTier {
  if (accountsApproved >= config.metaElite) return 5
  if (accountsApproved >= config.metaMensal) return 4
  if (accountsApproved >= 300) return 3
  if (accountsApproved >= 250) return 2
  if (accountsApproved >= 200) return 1
  return 0
}

export function calculateBonus(accountsApproved: number, config: Awaited<ReturnType<typeof getProductionConfig>>): number {
  const tier = getBonusTier(accountsApproved, config)
  if (tier === 5) return config.bonusElite
  if (tier === 4) return config.bonusMax
  if (tier === 3) return config.bonusNivel3
  if (tier === 2) return config.bonusNivel2
  if (tier === 1) return config.bonusNivel1
  return 0
}

export function calculateMonthlyAmount(
  accountsApproved: number,
  config: Awaited<ReturnType<typeof getProductionConfig>>
): { baseSalary: number; perAccountTotal: number; bonusTotal: number; total: number } {
  const baseSalary = config.salarioBase
  const perAccountTotal = accountsApproved * config.valorPorConta
  const bonusTotal = calculateBonus(accountsApproved, config)
  const total = baseSalary + perAccountTotal + bonusTotal
  return { baseSalary, perAccountTotal, bonusTotal, total }
}

export async function getProducerAvailableBalance(userId: string): Promise<number> {
  const closed = await prisma.producerMonthlyStatement.findMany({
    where: { userId, status: 'CLOSED' },
  })
  const totalCredited = closed.reduce((s, st) => s + Number(st.totalAmount), 0)

  const withdrawals = await prisma.withdrawal.findMany({
    where: { userId, status: { in: ['PENDING', 'PROCESSING', 'COMPLETED'] } },
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
