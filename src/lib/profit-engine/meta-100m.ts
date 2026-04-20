/**
 * Meta estrutural 100M - Cálculo dinâmico
 */
export type Meta100mResult = {
  metaLucro: number
  margemMediaAtual: number
  receitaNecessaria: number
  volumeNecessario: number
  crescimentoMensalNecessario: number
  ticketMedioIdeal: number
  churnMaximoAceitavel: number
  gapParaMeta: number
  lucroProjetado12m: number
}

export function calcMeta100m(params: {
  metaLucro12m: number
  lucroProjetado12m: number
  receitaAtual12m: number
  margemMediaPct: number
  ticketMedio: number
  clientesAtivos: number
}): Meta100mResult {
  const {
    metaLucro12m,
    lucroProjetado12m,
    receitaAtual12m,
    margemMediaPct,
    ticketMedio,
    clientesAtivos,
  } = params

  const gapParaMeta = metaLucro12m - lucroProjetado12m
  const margemNecessaria = margemMediaPct > 0 ? margemMediaPct : 0.4
  const receitaNecessaria = margemNecessaria > 0 ? metaLucro12m / (margemNecessaria / 100) : metaLucro12m * 2.5
  const volumeNecessario = ticketMedio > 0 ? receitaNecessaria / ticketMedio : 0
  const crescimentoNecessario = receitaAtual12m > 0 ? (receitaNecessaria / receitaAtual12m - 1) * 100 / 12 : 0
  const ticketMedioIdeal = clientesAtivos > 0 ? receitaNecessaria / clientesAtivos : ticketMedio
  /** Limite estrutural da meta 100M (wireframe / regra de negócio), não churn atual + buffer. */
  const churnMaximoAceitavel = 5

  return {
    metaLucro: metaLucro12m,
    margemMediaAtual: margemMediaPct,
    receitaNecessaria,
    volumeNecessario,
    crescimentoMensalNecessario: crescimentoNecessario,
    ticketMedioIdeal,
    churnMaximoAceitavel,
    gapParaMeta,
    lucroProjetado12m,
  }
}
