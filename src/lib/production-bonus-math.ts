/**
 * Cálculo puro de bônus/previsão (sem Prisma) — usado no servidor e no simulador do cliente.
 */

export type ProductionPaymentConfig = {
  salarioBase: number
  metaDiaria: number
  metaMensal: number
  metaElite: number
  valorPorConta: number
  bonusNivel1: number
  bonusNivel2: number
  bonusNivel3: number
  bonusMax: number
  bonusElite: number
}

export const DEFAULT_PRODUCTION_PAYMENT_CONFIG: ProductionPaymentConfig = {
  salarioBase: 1500,
  metaDiaria: 15,
  metaMensal: 330,
  metaElite: 600,
  valorPorConta: 0,
  bonusNivel1: 1000,
  bonusNivel2: 2000,
  bonusNivel3: 3000,
  bonusMax: 5000,
  bonusElite: 10000,
}

export type BonusTier = 0 | 1 | 2 | 3 | 4 | 5

export function getBonusTier(
  accountsApproved: number,
  config: ProductionPaymentConfig
): BonusTier {
  if (accountsApproved >= config.metaElite) return 5
  if (accountsApproved >= config.metaMensal) return 4
  if (accountsApproved >= 300) return 3
  if (accountsApproved >= 250) return 2
  if (accountsApproved >= 200) return 1
  return 0
}

export function calculateBonus(
  accountsApproved: number,
  config: ProductionPaymentConfig
): number {
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
  config: ProductionPaymentConfig
): { baseSalary: number; perAccountTotal: number; bonusTotal: number; total: number } {
  const baseSalary = config.salarioBase
  const perAccountTotal = accountsApproved * config.valorPorConta
  const bonusTotal = calculateBonus(accountsApproved, config)
  const total = baseSalary + perAccountTotal + bonusTotal
  return { baseSalary, perAccountTotal, bonusTotal, total }
}

/** Próximo degrau de bônus por volume (contas a mais e ganho extra de bônus ao atingir). */
export function nextTierProgress(
  accountsApproved: number,
  config: ProductionPaymentConfig
): { accountsToNext: number; bonusDelta: number; nextAt: number } | null {
  const steps = [200, 250, 300, config.metaMensal, config.metaElite]
  const bonusNow = calculateBonus(accountsApproved, config)
  for (const min of steps) {
    if (accountsApproved < min) {
      const bonusAt = calculateBonus(min, config)
      return {
        accountsToNext: min - accountsApproved,
        bonusDelta: Math.max(0, bonusAt - bonusNow),
        nextAt: min,
      }
    }
  }
  return null
}
