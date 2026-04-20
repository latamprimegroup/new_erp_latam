/** Fase de aquecimento pós-entrega (Módulo 02 / infraestrutura). */
export type WarmUpPhase = 'PENDING' | 'WARMING' | 'READY'

export function warmUpFromDeliveredAt(deliveredAt: Date | null, warmDays = 7): {
  phase: WarmUpPhase
  label: string
  day: number
  maxDays: number
} {
  if (!deliveredAt) {
    return { phase: 'PENDING', label: 'Aguardando entrega', day: 0, maxDays: warmDays }
  }
  const elapsed = Date.now() - deliveredAt.getTime()
  const day = Math.min(warmDays, Math.max(1, Math.floor(elapsed / 86_400_000) + 1))
  if (day >= warmDays) {
    return { phase: 'READY', label: `Aquecimento concluído (${warmDays}/${warmDays} dias)`, day: warmDays, maxDays: warmDays }
  }
  return { phase: 'WARMING', label: `Aquecendo — dia ${day}/${warmDays}`, day, maxDays: warmDays }
}
