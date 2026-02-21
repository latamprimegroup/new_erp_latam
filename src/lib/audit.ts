import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'

export type AuditParams = {
  userId?: string
  action: string
  entity: string
  entityId?: string
  details?: Record<string, unknown>
  oldValue?: Record<string, unknown>
  newValue?: Record<string, unknown>
  ip?: string
}

/**
 * Registra log de auditoria imutável.
 * Logs não devem ser editados ou excluídos (governança).
 */
export async function audit(params: AuditParams) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        details: (params.details ?? undefined) as Prisma.InputJsonValue | undefined,
        oldValue: (params.oldValue ?? undefined) as Prisma.InputJsonValue | undefined,
        newValue: (params.newValue ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: params.ip,
      },
    })
  } catch (e) {
    console.error('Audit log error:', e)
  }
}
