/** Diagnósticos automáticos a partir das métricas diárias (Módulo 03). */

export type CreativeDiagnostic = {
  kind: 'hook' | 'vsl'
  message: string
}

/** CTR em percentual (ex.: 1.2 = 1,2%). ROI = vendas / gasto (mesma moeda). */
export function creativeDiagnosticsFromMetrics(
  spend: number,
  ctrPercent: number,
  sales: number
): CreativeDiagnostic[] {
  const out: CreativeDiagnostic[] = []
  if (ctrPercent < 1) {
    out.push({
      kind: 'hook',
      message:
        'Atenção: seu gancho não está parando o scroll. Solicite um novo hook à agência (Creative Vault → Minhas Edições).',
    })
  }
  const roi = spend > 0 ? sales / spend : 0
  if (ctrPercent > 3 && roi < 1) {
    out.push({
      kind: 'vsl',
      message:
        'Atenção: o anúncio atrai, mas a página não converte. Verifique o módulo de VSL (Pitch Watch) e a oferta.',
    })
  }
  return out
}
