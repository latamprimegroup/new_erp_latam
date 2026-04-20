import { prisma } from './prisma'

/** Valor mínimo (R$) para solicitar saque — Plug & Play. */
export const PLUG_PLAY_MIN_WITHDRAWAL_BRL = 100

/**
 * Janela de saque: a partir do dia N do mês até o fim (padrão 25).
 * SystemSetting `plugplay_saque_dia_inicio` = número 1–28; ou `plugplay_saque_sempre_liberado` = "1" ignora o calendário.
 */
export async function isPlugPlayWithdrawalPeriodOpen(): Promise<boolean> {
  const [always, diaIni] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: 'plugplay_saque_sempre_liberado' } }),
    prisma.systemSetting.findUnique({ where: { key: 'plugplay_saque_dia_inicio' } }),
  ])
  if (always?.value === '1') return true
  const day = new Date().getDate()
  const start = diaIni ? Math.min(28, Math.max(1, parseInt(diaIni.value, 10) || 25)) : 25
  return day >= start
}
