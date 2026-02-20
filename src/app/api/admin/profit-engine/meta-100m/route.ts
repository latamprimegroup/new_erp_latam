/**
 * Meta 100M - Cálculo dinâmico
 */
import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { calcMeta100m } from '@/lib/profit-engine/meta-100m'

export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const refDate = new Date()
  refDate.setHours(0, 0, 0, 0)

  const [snapshot, metrics, setting] = await Promise.all([
    prisma.profitEngineSnapshot.findFirst({
      where: { referenceDate: { lte: refDate } },
      orderBy: { referenceDate: 'desc' },
    }),
    prisma.customerMetrics.findMany({ select: { ticketMedio: true, churnFlag: true } }),
    prisma.systemSetting.findUnique({ where: { key: 'meta_lucro_12m' } }),
  ])

  const metaLucro12m = setting ? parseFloat(setting.value) : 100_000_000
  const lucroProjetado12m = snapshot?.lucroProjetado12m ? Number(snapshot.lucroProjetado12m) : 0
  const receitaAtual12m = snapshot?.receitaBruta ? Number(snapshot.receitaBruta) : 0
  const margemMediaPct = snapshot?.margemLiquidaPct ? Number(snapshot.margemLiquidaPct) : 40
  const ticketMedio =
    metrics.length > 0 ? metrics.reduce((s, m) => s + Number(m.ticketMedio), 0) / metrics.length : 0
  const churnAtual = metrics.length > 0 ? (metrics.filter((m) => m.churnFlag).length / metrics.length) * 100 : 0
  const clientesAtivos = metrics.length

  const result = calcMeta100m({
    metaLucro12m,
    lucroProjetado12m,
    receitaAtual12m,
    margemMediaPct,
    ticketMedio,
    churnAtual,
    clientesAtivos,
  })

  return NextResponse.json(result)
}
