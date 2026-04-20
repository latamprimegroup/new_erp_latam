import type { PrismaClient } from '@prisma/client'

export async function appendUniActivityLog(
  prisma: PrismaClient,
  uniId: string,
  kind: string,
  message: string
): Promise<void> {
  const k = kind.trim().slice(0, 32) || 'general'
  const m = message.trim().slice(0, 500)
  if (!m) return
  await prisma.vaultIndustrialUnitActivityLog.create({
    data: { uniId, kind: k, message: m },
  })
}
