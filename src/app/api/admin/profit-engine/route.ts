/**
 * Profit Engine - Painel principal
 */
import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const refDate = new Date()
  refDate.setHours(0, 0, 0, 0)

  const [snapshot, unitEconomics, valuation] = await Promise.all([
    prisma.profitEngineSnapshot.findFirst({
      where: { referenceDate: { lte: refDate } },
      orderBy: { referenceDate: 'desc' },
    }),
    prisma.unitEconomicsSnapshot.findMany({
      where: { referenceDate: { lte: refDate } },
      orderBy: { referenceDate: 'desc' },
      take: 50,
    }),
    prisma.valuationSnapshot.findFirst({
      where: { referenceDate: { lte: refDate } },
      orderBy: { referenceDate: 'desc' },
    }),
  ])

  const latestUnit = unitEconomics.filter(
    (u, i, arr) => !arr.find((x, j) => j < i && x.tipoConta === u.tipoConta && x.moeda === u.moeda)
  )

  return NextResponse.json({
    snapshot: snapshot
      ? {
          referenceDate: snapshot.referenceDate,
          receitaBruta: Number(snapshot.receitaBruta),
          receitaLiquida: Number(snapshot.receitaLiquida),
          custoVariavel: Number(snapshot.custoVariavel),
          custoFixo: Number(snapshot.custoFixo),
          margemBruta: Number(snapshot.margemBruta),
          margemBrutaPct: snapshot.margemBrutaPct != null ? Number(snapshot.margemBrutaPct) : null,
          margemLiquida: Number(snapshot.margemLiquida),
          margemLiquidaPct: snapshot.margemLiquidaPct != null ? Number(snapshot.margemLiquidaPct) : null,
          lucroOperacional: Number(snapshot.lucroOperacional),
          lucroLiquido: Number(snapshot.lucroLiquido),
          lucroAcumuladoAno: Number(snapshot.lucroAcumuladoAno),
          lucroProjetado12m: snapshot.lucroProjetado12m != null ? Number(snapshot.lucroProjetado12m) : null,
          metaLucro12m: snapshot.metaLucro12m != null ? Number(snapshot.metaLucro12m) : null,
          gapParaMeta: snapshot.gapParaMeta != null ? Number(snapshot.gapParaMeta) : null,
        }
      : null,
    unitEconomics: latestUnit.map((u) => ({
      tipoConta: u.tipoConta,
      moeda: u.moeda,
      receitaPorUnidade: Number(u.receitaPorUnidade),
      custoPorUnidade: Number(u.custoPorUnidade),
      margemPorUnidade: Number(u.margemPorUnidade),
      cacReal: u.cacReal != null ? Number(u.cacReal) : null,
      ltvReal: u.ltvReal != null ? Number(u.ltvReal) : null,
      payback: u.payback != null ? Number(u.payback) : null,
      scoreRentabilidade: u.scoreRentabilidade,
      margemNegativa: u.margemNegativa,
    })),
    valuation: valuation
      ? {
          revenue12m: Number(valuation.revenue12m),
          ebitda12m: valuation.ebitda12m != null ? Number(valuation.ebitda12m) : null,
          conservador: valuation.valuationConservador != null ? Number(valuation.valuationConservador) : null,
          moderado: valuation.valuationModerado != null ? Number(valuation.valuationModerado) : null,
          agressivo: valuation.valuationAgressivo != null ? Number(valuation.valuationAgressivo) : null,
        }
      : null,
  })
}
