import type { PrismaClient } from '@prisma/client'
import { audit } from '@/lib/audit'

/**
 * Primeiro acesso do produtor ao ativo: DISPONIVEL → EM_PRODUCAO (vínculo producerId já definido pelo gerente).
 */
export async function touchAdsCoreEmProducaoOnOpen(
  prisma: PrismaClient,
  opts: {
    assetId: string
    userId: string
    role: string | undefined
    ip?: string
  }
): Promise<void> {
  if (opts.role !== 'PRODUCER') return
  const a = await prisma.adsCoreAsset.findUnique({
    where: { id: opts.assetId },
    select: { producerId: true, statusProducao: true },
  })
  if (!a || a.producerId !== opts.userId || a.statusProducao !== 'DISPONIVEL') return
  await prisma.adsCoreAsset.update({
    where: { id: opts.assetId },
    data: { statusProducao: 'EM_PRODUCAO' },
  })
  await audit({
    userId: opts.userId,
    action: 'ads_core_asset_em_producao_primeiro_acesso',
    entity: 'AdsCoreAsset',
    entityId: opts.assetId,
    ip: opts.ip,
    details: { from: 'DISPONIVEL', to: 'EM_PRODUCAO' },
  })
}
