/**
 * POST - Simular expansão internacional
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  pais: z.string().optional(),
  cac: z.number().min(0),
  margem: z.number().min(0).max(100),
  churn: z.number().min(0).max(100),
  investimento: z.number().min(0),
  clientesAlvo: z.number().min(1).default(100),
})

export async function POST(req: NextRequest) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response
  try {
    const data = schema.parse(await req.json())
    const ticketAgg = await prisma.order.aggregate({
      where: { status: 'DELIVERED', paidAt: { not: null } },
      _avg: { value: true },
    })
    const ticketMedio =
      ticketAgg._avg.value != null ? Number(ticketAgg._avg.value) : 2000
    const receitaMediaMensal = ticketMedio * 0.3
    const retencaoMensal = (100 - data.churn) / 100
    let receitaAcum12m = 0
    for (let m = 0; m < 12; m++) {
      const clientesAtivos = data.clientesAlvo * Math.pow(retencaoMensal, m) * (1 - m * 0.02)
      receitaAcum12m += clientesAtivos * receitaMediaMensal
    }
    const custoAquisicao = data.cac * data.clientesAlvo
    const receita12m = receitaAcum12m * (data.margem / 100)
    const roi = data.investimento > 0 ? ((receita12m - data.investimento) / data.investimento) * 100 : 0
    const breakEvenMeses = receita12m > 0 ? (data.investimento / (receita12m / 12)) : 999
    const valuationAtual = await prisma.valuationSnapshot.findFirst({
      where: { referenceDate: { lte: new Date() } },
      orderBy: { referenceDate: 'desc' },
    })
    const rec12mAtual = valuationAtual ? Number(valuationAtual.revenue12m) : 0
    const impactoValuation = (rec12mAtual + receitaAcum12m) * 2.5 - rec12mAtual * 2.5
    return NextResponse.json({
      receitaProjetada12m: Math.round(receitaAcum12m * 100) / 100,
      margemProjetada: receita12m,
      roi: Math.round(roi * 10) / 10,
      breakEvenMeses: Math.round(breakEvenMeses * 10) / 10,
      custoAquisicao,
      impactoValuation: Math.round(impactoValuation * 100) / 100,
    })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    return NextResponse.json({ error: 'Erro' }, { status: 500 })
  }
}
