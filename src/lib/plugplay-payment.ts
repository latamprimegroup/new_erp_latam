/**
 * Plug & Play: Salário base R$ 2.500 + bônus por meta
 * Contas = operações SURVIVED_24H (qualidade conferida)
 *
 * META PADRÃO:
 * 200 → Bronze + R$ 1.000 = R$ 3.500
 * 250 → Prata + R$ 2.000 = R$ 4.500
 * 300 → Ouro + R$ 3.000 = R$ 5.500
 * 330 → Meta batida + R$ 5.000 = R$ 7.500
 *
 * META ELITE (600 contas):
 * Bônus R$ 10.000 = Total R$ 12.500
 */

import { prisma } from './prisma'

export const DEFAULT_CONFIG = {
  salarioBase: 2500,
  metaDiaria: 15,
  metaMensal: 330,
  metaElite: 600,
  bonusBronze: 1000,
  bonusPrata: 2000,
  bonusOuro: 3000,
  bonusMetaBatida: 5000,
  bonusElite: 10000,
}

export type PlugPlayTier = 'BRONZE' | 'PRATA' | 'OURO' | 'META_BATIDA' | 'ELITE' | null

export async function getPlugPlayConfig() {
  const keys = [
    'plugplay_salario_base',
    'plugplay_meta_diaria',
    'plugplay_meta_mensal',
    'plugplay_meta_elite',
    'plugplay_bonus_bronze',
    'plugplay_bonus_prata',
    'plugplay_bonus_ouro',
    'plugplay_bonus_meta',
    'plugplay_bonus_elite',
  ]
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: keys } },
  })
  const m = Object.fromEntries(settings.map((s) => [s.key, s.value]))
  return {
    salarioBase: parseInt(m.plugplay_salario_base || String(DEFAULT_CONFIG.salarioBase), 10),
    metaDiaria: parseInt(m.plugplay_meta_diaria || String(DEFAULT_CONFIG.metaDiaria), 10),
    metaMensal: parseInt(m.plugplay_meta_mensal || String(DEFAULT_CONFIG.metaMensal), 10),
    metaElite: parseInt(m.plugplay_meta_elite || String(DEFAULT_CONFIG.metaElite), 10),
    bonusBronze: parseInt(m.plugplay_bonus_bronze || String(DEFAULT_CONFIG.bonusBronze), 10),
    bonusPrata: parseInt(m.plugplay_bonus_prata || String(DEFAULT_CONFIG.bonusPrata), 10),
    bonusOuro: parseInt(m.plugplay_bonus_ouro || String(DEFAULT_CONFIG.bonusOuro), 10),
    bonusMetaBatida: parseInt(m.plugplay_bonus_meta || String(DEFAULT_CONFIG.bonusMetaBatida), 10),
    bonusElite: parseInt(m.plugplay_bonus_elite || String(DEFAULT_CONFIG.bonusElite), 10),
  }
}

export function getTier(accountsSurvived: number, config: Awaited<ReturnType<typeof getPlugPlayConfig>>): PlugPlayTier {
  if (accountsSurvived >= config.metaElite) return 'ELITE'
  if (accountsSurvived >= config.metaMensal) return 'META_BATIDA'
  if (accountsSurvived >= 300) return 'OURO'
  if (accountsSurvived >= 250) return 'PRATA'
  if (accountsSurvived >= 200) return 'BRONZE'
  return null
}

export function calculateBonus(accountsSurvived: number, config: Awaited<ReturnType<typeof getPlugPlayConfig>>): number {
  const tier = getTier(accountsSurvived, config)
  if (tier === 'ELITE') return config.bonusElite
  if (tier === 'META_BATIDA') return config.bonusMetaBatida
  if (tier === 'OURO') return config.bonusOuro
  if (tier === 'PRATA') return config.bonusPrata
  if (tier === 'BRONZE') return config.bonusBronze
  return 0
}

export function calculateMonthlyAmount(
  accountsSurvived: number,
  config: Awaited<ReturnType<typeof getPlugPlayConfig>>
): { baseSalary: number; bonusTotal: number; total: number; tier: PlugPlayTier } {
  const baseSalary = config.salarioBase
  const bonusTotal = calculateBonus(accountsSurvived, config)
  const total = baseSalary + bonusTotal
  const tier = getTier(accountsSurvived, config)
  return { baseSalary, bonusTotal, total, tier }
}

export async function getPlugPlayAvailableBalance(collaboratorId: string): Promise<number> {
  const closed = await prisma.plugPlayMonthlyStatement.findMany({
    where: { collaboratorId, status: 'CLOSED' },
  })
  const totalCredited = closed.reduce((s, st) => s + Number(st.totalAmount), 0)

  const withdrawals = await prisma.withdrawal.findMany({
    where: { userId: collaboratorId, status: { in: ['PENDING', 'PROCESSING', 'COMPLETED', 'HELD'] } },
  })
  const totalWithdrawn = withdrawals.reduce((s, w) => s + Number(w.netValue), 0)

  return Math.max(0, totalCredited - totalWithdrawn)
}

export async function closeMonthForPlugPlay(
  collaboratorId: string,
  month: number,
  year: number,
  closedById: string
) {
  const config = await getPlugPlayConfig()
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59)

  const accountsSurvived = await prisma.blackOperation.count({
    where: {
      collaboratorId,
      status: 'SURVIVED_24H',
      updatedAt: { gte: start, lte: end },
    },
  })

  const { baseSalary, bonusTotal, total, tier } = calculateMonthlyAmount(accountsSurvived, config)

  const st = await prisma.plugPlayMonthlyStatement.upsert({
    where: {
      collaboratorId_month_year: { collaboratorId, month, year },
    },
    create: {
      collaboratorId,
      month,
      year,
      accountsSurvived24h: accountsSurvived,
      baseSalary,
      bonusTotal,
      totalAmount: total,
      tier,
      status: 'CLOSED',
      closedAt: new Date(),
      closedById,
    },
    update: {
      accountsSurvived24h: accountsSurvived,
      baseSalary,
      bonusTotal,
      totalAmount: total,
      tier,
      status: 'CLOSED',
      closedAt: new Date(),
      closedById,
    },
  })
  return st
}
