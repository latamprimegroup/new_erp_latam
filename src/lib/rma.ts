import type { AccountRmaActionTaken, AccountRmaReason, AccountRmaStatus } from '@prisma/client'

export const RMA_REASON_LABELS: Record<AccountRmaReason, string> = {
  ERRO_CONFIGURACAO: 'Erro de configuração',
  FALHA_ATIVACAO: 'Falha de ativação',
  SUSPENSAO_IMEDIATA: 'Suspensão imediata',
  LOGIN_INVALIDO: 'Login inválido',
  CHECKPOINT_BLOCK: 'Bloqueio checkpoint',
  BAN_IMMEDIATE: 'Ban imediato',
  PROXY_ERROR: 'Erro de proxy',
  PAGAMENTO_SUSPEITO: 'Pagamento suspeito',
  PRATICAS_COMERCIAIS: 'Práticas comerciais inaceitáveis',
  VERIFICACAO_IDENTIDADE: 'Verificação de identidade',
  G2_FALHOU: 'G2 falhou',
  OUTRO: 'Outro',
}

export const RMA_ACTION_LABELS: Record<AccountRmaActionTaken, string> = {
  REPOSICAO_EFETUADA: 'Reposição efetuada',
  REEMBOLSO: 'Reembolso',
  GARANTIA_NEGADA: 'Garantia negada',
  AGUARDANDO: 'Aguardando decisão',
}

/** Calcula status de garantia dado o prazo em horas e a data da entrega/compra */
export function warrantyStatus(
  warrantyHours: number | null | undefined,
  referenceDate: Date | string | null | undefined
): 'VALID' | 'EXPIRED' | 'NO_WARRANTY' {
  if (!warrantyHours || !referenceDate) return 'NO_WARRANTY'
  const ref = new Date(referenceDate)
  const expiresAt = new Date(ref.getTime() + warrantyHours * 60 * 60 * 1000)
  return expiresAt > new Date() ? 'VALID' : 'EXPIRED'
}

export const RMA_STATUS_LABELS: Record<AccountRmaStatus, string> = {
  EM_ANALISE: 'Em análise',
  EM_REPOSICAO: 'Em reposição',
  CONCLUIDO: 'Concluído',
  NEGADO_TERMO: 'Negado (violação de termos)',
}

export function minutesBetween(opened: Date, ended: Date): number {
  return Math.max(0, Math.round((ended.getTime() - opened.getTime()) / 60_000))
}

export function parseEvidenceUrls(evidenceUrls: unknown): string[] {
  if (!evidenceUrls) return []
  if (Array.isArray(evidenceUrls)) {
    return evidenceUrls.filter((x): x is string => typeof x === 'string')
  }
  return []
}
