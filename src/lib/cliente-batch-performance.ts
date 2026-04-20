import { prisma } from '@/lib/prisma'

export type BatchPerformanceRow = {
  monthKey: string
  label: string
  entreguesNoMes: number
  comPeloMenos30Dias: number
  estaveisApos30Dias: number
  pctEstaveis: number | null
}

const MS_30D = 30 * 86_400_000

/**
 * Cohort por mês de entrega (deliveredAt): entre contas com ≥30 dias, % sem CRITICAL e sem vault.
 */
export async function getClienteBatchPerformance(clientId: string): Promise<BatchPerformanceRow[]> {
  const accounts = await prisma.stockAccount.findMany({
    where: { clientId, deliveredAt: { not: null } },
    select: { deliveredAt: true, status: true, archivedAt: true },
  })
  if (accounts.length === 0) return []

  const now = Date.now()
  const byMonth = new Map<string, typeof accounts>()
  for (const a of accounts) {
    const d = a.deliveredAt!
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!byMonth.has(key)) byMonth.set(key, [])
    byMonth.get(key)!.push(a)
  }

  const sortedKeys = Array.from(byMonth.keys()).sort().reverse().slice(0, 6)
  const rows: BatchPerformanceRow[] = []

  for (const monthKey of sortedKeys) {
    const cohort = byMonth.get(monthKey)!
    const entreguesNoMes = cohort.length
    let comPeloMenos30Dias = 0
    let estaveisApos30Dias = 0
    for (const a of cohort) {
      const t = a.deliveredAt!.getTime()
      if (now - t < MS_30D) continue
      comPeloMenos30Dias++
      if (a.status !== 'CRITICAL' && !a.archivedAt) estaveisApos30Dias++
    }
    const [y, m] = monthKey.split('-').map(Number)
    const label = new Date(y, m - 1, 15).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    rows.push({
      monthKey,
      label,
      entreguesNoMes,
      comPeloMenos30Dias,
      estaveisApos30Dias,
      pctEstaveis:
        comPeloMenos30Dias > 0
          ? Math.round((estaveisApos30Dias / comPeloMenos30Dias) * 1000) / 10
          : null,
    })
  }

  return rows
}
