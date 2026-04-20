import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type CommercialAuditAction =
  | 'VIEW_INTELLIGENCE_LEAD'
  | 'EXPORT_INTELLIGENCE_CSV'
  | 'GENERATE_LEAD_AI_SCRIPT'
  | 'REGENERATE_LEAD_AI_BRIEF'

export async function logCommercialDataAudit(input: {
  userId?: string | null
  role?: string | null
  action: CommercialAuditAction | string
  entityType: string
  entityId?: string | null
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  const uid = input.userId?.trim()
  if (!uid) return
  const roleStr = (input.role ?? 'unknown').toString().slice(0, 24)
  try {
    await prisma.commercialDataAuditLog.create({
      data: {
        userId: uid,
        role: roleStr,
        action: String(input.action).slice(0, 64),
        entityType: input.entityType.slice(0, 48),
        entityId: input.entityId?.slice(0, 191) ?? null,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    })
  } catch (e) {
    console.error('commercial audit log', e)
  }
}
