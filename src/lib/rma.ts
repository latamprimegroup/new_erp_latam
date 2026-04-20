import type { AccountRmaReason, AccountRmaStatus } from '@prisma/client'

export const RMA_REASON_LABELS: Record<AccountRmaReason, string> = {
  ERRO_CONFIGURACAO: 'Erro de configuração',
  FALHA_ATIVACAO: 'Falha de ativação',
  SUSPENSAO_IMEDIATA: 'Suspensão imediata',
  LOGIN_INVALIDO: 'Login inválido',
  CHECKPOINT_BLOCK: 'Bloqueio checkpoint',
  BAN_IMMEDIATE: 'Ban imediato',
  PROXY_ERROR: 'Erro de proxy',
  OUTRO: 'Outro',
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
