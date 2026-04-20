import type { AdsCoreAssetProductionStatus } from '@prisma/client'

/** Rótulos alinhados à especificação G2 Ads Ativos (painel do produtor). */
const PRODUCER_LABELS: Record<AdsCoreAssetProductionStatus, string> = {
  DISPONIVEL: 'Aguardando início',
  EM_PRODUCAO: 'Em produção',
  VERIFICACAO_G2: 'Verificação G2 iniciada',
  APROVADO: 'Aprovado',
  REPROVADO: 'Rejeitado',
}

export function labelAdsCoreStatusProducao(
  status: AdsCoreAssetProductionStatus | string
): string {
  return PRODUCER_LABELS[status as AdsCoreAssetProductionStatus] ?? String(status)
}

/**
 * Visão gerente / estoque: diferencia demanda ainda sem produtor vs atribuída e não aberta.
 */
export function labelAdsCoreStatusGerente(
  status: AdsCoreAssetProductionStatus | string,
  opts?: { assignedToProducer?: boolean }
): string {
  if (status === 'DISPONIVEL') {
    if (opts?.assignedToProducer) return 'Aguardando início (atribuído)'
    return 'Aguardando início (estoque)'
  }
  return labelAdsCoreStatusProducao(status)
}
