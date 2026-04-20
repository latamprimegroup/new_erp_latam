/**
 * Kill switch global (CEO): pausa operações para perfis não-ADMIN.
 * Valor em SystemSetting key `global_kill_switch`: "1" ou "true" = ativo.
 */

import { prisma } from '@/lib/prisma'

const KEY = 'global_kill_switch'
const MARKETING_EMERGENCY_KEY = 'marketing_emergency_pause'

export async function isGlobalKillSwitchActive(): Promise<boolean> {
  if (process.env.DISABLE_KILL_SWITCH_DB_CHECK === '1') return false
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: KEY } })
    const v = row?.value?.trim().toLowerCase()
    return v === '1' || v === 'true' || v === 'on'
  } catch {
    return false
  }
}

/** War Room: pausa LPs/redirecionamentos/cloaking quando `marketing_emergency_pause` = 1/true. */
export async function isMarketingEmergencyPauseActive(): Promise<boolean> {
  if (process.env.DISABLE_KILL_SWITCH_DB_CHECK === '1') return false
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: MARKETING_EMERGENCY_KEY } })
    const v = row?.value?.trim().toLowerCase()
    return v === '1' || v === 'true' || v === 'on'
  } catch {
    return false
  }
}
