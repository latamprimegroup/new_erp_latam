/**
 * Finance Audit — Auditoria especializada para operações financeiras.
 *
 * Enriquece o AuditLog padrão com:
 *   - IP do usuário (extraído dos headers X-Forwarded-For / X-Real-IP)
 *   - Action tipada para operações financeiras
 *   - Categoria 'FINANCE' para filtros de auditoria
 *
 * Uso:
 *   await financeAudit(req, { userId, action: 'baixa_titulo', entityId: entryId, details: { valor, categoria } })
 */

import { prisma } from './prisma'

export type FinanceAuditAction =
  | 'baixa_titulo'          // Marcar lançamento como pago
  | 'alteracao_valor'       // Editar valor de lançamento existente
  | 'create_entry'          // Criar lançamento manual
  | 'cancel_entry'          // Cancelar lançamento
  | 'reconcile_sale'        // Confirmar recebimento de venda
  | 'create_wallet'         // Criar carteira/banco
  | 'update_wallet'         // Atualizar saldo ou dados da carteira
  | 'create_nfe'            // Registrar NF-e
  | 'update_nfe_status'     // Atualizar status da NF-e
  | 'bridge_triggered'      // Bridge comercial→financeiro acionado manualmente
  | 'export_contabil'       // Exportação de dados contábeis
  | 'financial_other'       // Ação genérica

export type FinanceAuditParams = {
  userId:    string | undefined
  action:    FinanceAuditAction
  entityId?: string
  entity?:   string
  details?:  Record<string, unknown>
}

/**
 * Extrai o IP real da requisição (lida com proxies/Vercel/Hostinger).
 */
export function extractIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'
  )
}

/**
 * Registra auditoria financeira com IP automaticamente extraído da request.
 * Não lança exceção — erros de auditoria apenas são logados no console.
 */
export async function financeAudit(req: Request, params: FinanceAuditParams): Promise<void> {
  try {
    const ip = extractIp(req)
    await prisma.auditLog.create({
      data: {
        userId:   params.userId ?? null,
        action:   params.action,
        entity:   params.entity ?? 'FinancialEntry',
        entityId: params.entityId ?? null,
        details:  {
          ...(params.details ?? {}),
          _category: 'FINANCE',
          _ip:       ip,
        },
        ip,
      },
    })
  } catch (err) {
    console.error('[finance-audit] Erro ao gravar log de auditoria financeira:', err)
  }
}
