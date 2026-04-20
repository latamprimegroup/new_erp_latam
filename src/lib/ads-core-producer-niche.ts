import type { PrismaClient } from '@prisma/client'

/**
 * Se existir ao menos um vínculo para o nicho, só esses produtores podem ser atribuídos.
 * Se não houver vínculos, qualquer produtor é elegível (compatibilidade com nichos legados).
 */
export async function isAdsCoreNicheProducerRestricted(
  prisma: PrismaClient,
  nicheId: string
): Promise<boolean> {
  const n = await prisma.adsCoreProducerNiche.count({ where: { nicheId } })
  return n > 0
}

export async function assertProducerAllowedForAdsCoreNiche(
  prisma: PrismaClient,
  nicheId: string,
  producerId: string | null | undefined
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!producerId) return { ok: true }
  const restricted = await isAdsCoreNicheProducerRestricted(prisma, nicheId)
  if (!restricted) return { ok: true }
  const row = await prisma.adsCoreProducerNiche.findFirst({
    where: { nicheId, producerId },
    select: { id: true },
  })
  if (!row) {
    return {
      ok: false,
      error:
        'Este colaborador não está habilitado para o nicho selecionado. Configure em ADS CORE — Gestão por nicho.',
    }
  }
  return { ok: true }
}
