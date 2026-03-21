/**
 * Perfil de Reputação do Cliente (melhoria 004)
 * Score 0-100, badges VIP/Regular/High Risk
 */

export type ReputationBadge = 'VIP' | 'REGULAR' | 'HIGH_RISK'

export function getReputationBadge(score: number | null | undefined): ReputationBadge | null {
  if (score == null) return null
  if (score >= 80) return 'VIP'
  if (score >= 50) return 'REGULAR'
  return 'HIGH_RISK'
}

export const BADGE_LABELS: Record<ReputationBadge, string> = {
  VIP: 'VIP / Safe',
  REGULAR: 'Regular',
  HIGH_RISK: 'High Risk',
}

export const BADGE_STYLES: Record<ReputationBadge, string> = {
  VIP: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400',
  REGULAR: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400',
  HIGH_RISK: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400',
}

export function canBuyG2Premium(score: number | null | undefined): boolean {
  const badge = getReputationBadge(score)
  return badge !== 'HIGH_RISK'
}
