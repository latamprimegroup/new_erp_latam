/**
 * Níveis de bônus automático por produção mensal
 * 200 → nível 1, 250 → nível 2, 300 → nível 3, 330 → máximo
 */

import { prisma } from './prisma'

const DEFAULT_LEVELS = [200, 250, 300, 330]

export async function getBonusLevels(): Promise<number[]> {
  const settings = await prisma.systemSetting.findMany({
    where: {
      key: { in: ['bonus_nivel_1', 'bonus_nivel_2', 'bonus_nivel_3', 'bonus_nivel_max'] },
    },
  })
  const map = Object.fromEntries(settings.map((s) => [s.key, parseInt(s.value, 10)]))
  return [
    map.bonus_nivel_1 || DEFAULT_LEVELS[0],
    map.bonus_nivel_2 || DEFAULT_LEVELS[1],
    map.bonus_nivel_3 || DEFAULT_LEVELS[2],
    map.bonus_nivel_max || DEFAULT_LEVELS[3],
  ]
}

export function getBonusTierForProduction(production: number, levels: number[]): number {
  if (production >= levels[3]) return 4
  if (production >= levels[2]) return 3
  if (production >= levels[1]) return 2
  if (production >= levels[0]) return 1
  return 0
}
