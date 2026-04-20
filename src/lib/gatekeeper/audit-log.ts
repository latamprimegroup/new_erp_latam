/**
 * Logs de auditoria server-side para monitoramento (ex.: painel / agregador de logs).
 * Nunca enviar PII completa — usar máscaras quando possível.
 */

export type GatekeeperAuditStep =
  | 'GMAIL_BULK'
  | 'CNPJ_INGEST'
  | 'CNPJ_TAG'
  | 'ID_DOCUMENT'
  | 'ID_DOC_DOWNLOAD'
  | 'CARD_PAN'
  | 'IMAGE_TEST'
  | 'WAREHOUSE_STATUS'
  | 'UNIQUENESS'

export function gatekeeperAudit(
  step: GatekeeperAuditStep,
  message: string,
  meta?: Record<string, string | number | boolean | null | undefined>
): void {
  const suffix =
    meta && Object.keys(meta).length > 0
      ? ` ${JSON.stringify(meta)}`
      : ''
  console.log(`[GATEKEEPER] [${step}] ${message}${suffix}`)
}
