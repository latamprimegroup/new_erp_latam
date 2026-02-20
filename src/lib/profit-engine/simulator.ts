/**
 * Simulador de Escala Massiva
 */
export type SimulatorInput = {
  aumentoTicketPct?: number
  reducaoChurnPct?: number
  aumentoEficienciaPct?: number
  reducaoCustoUnidadePct?: number
  aumentoRetencaoPct?: number
  receitaBase: number
  margemBasePct: number
  custoBase: number
}

export type SimulatorOutput = {
  receitaProjetada: number
  custoProjetado: number
  margemProjetadaPct: number
  lucroProjetado: number
  impactoValuation: number
  crescimentoNecessarioMensal: number
}

export function runProfitSimulator(input: SimulatorInput): SimulatorOutput {
  const {
    aumentoTicketPct = 0,
    reducaoChurnPct = 0,
    aumentoEficienciaPct = 0,
    reducaoCustoUnidadePct = 0,
    aumentoRetencaoPct = 0,
    receitaBase,
    margemBasePct,
    custoBase,
  } = input

  let receita = receitaBase * (1 + aumentoTicketPct / 100) * (1 + aumentoRetencaoPct / 100) * (1 - reducaoChurnPct / 200)
  let custo = custoBase * (1 - reducaoCustoUnidadePct / 100) * (1 - aumentoEficienciaPct / 200)

  const lucro = receita - custo
  const margemPct = receita > 0 ? (lucro / receita) * 100 : 0
  const valuationMultiple = 2.5
  const impactoValuation = lucro * valuationMultiple - (receitaBase - custoBase) * valuationMultiple
  const meta100m = 100_000_000
  const crescimentoNecessario = lucro > 0 ? ((meta100m / lucro) ** (1 / 12) - 1) * 100 : 0

  return {
    receitaProjetada: receita,
    custoProjetado: custo,
    margemProjetadaPct: margemPct,
    lucroProjetado: lucro,
    impactoValuation,
    crescimentoNecessarioMensal: Math.max(0, crescimentoNecessario),
  }
}
