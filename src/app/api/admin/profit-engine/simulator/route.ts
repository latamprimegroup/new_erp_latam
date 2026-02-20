/**
 * Simulador de Escala Massiva
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { runProfitSimulator } from '@/lib/profit-engine/simulator'

export async function POST(req: NextRequest) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  let body: {
    aumentoTicketPct?: number
    reducaoChurnPct?: number
    aumentoEficienciaPct?: number
    reducaoCustoUnidadePct?: number
    aumentoRetencaoPct?: number
  } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const refDate = new Date()
  refDate.setHours(0, 0, 0, 0)

  const snapshot = await prisma.profitEngineSnapshot.findFirst({
    where: { referenceDate: { lte: refDate } },
    orderBy: { referenceDate: 'desc' },
  })

  const receitaBase = snapshot ? Number(snapshot.receitaBruta) : 0
  const custoBase = snapshot ? Number(snapshot.custoVariavel) + Number(snapshot.custoFixo) : 0
  const margemBasePct = receitaBase > 0 ? ((receitaBase - custoBase) / receitaBase) * 100 : 0

  const output = runProfitSimulator({
    ...body,
    receitaBase,
    margemBasePct,
    custoBase,
  })

  return NextResponse.json(output)
}
