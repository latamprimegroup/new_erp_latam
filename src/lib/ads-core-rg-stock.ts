import type { PrismaClient } from '@prisma/client'

type RgDb = Pick<PrismaClient, 'adsCoreRgStock'>

/** Encerra vínculo de RG do estoque quando o ativo vai para estado terminal G2. */
export async function finalizeAdsCoreRgStockIfTerminal(
  db: RgDb,
  assetId: string,
  status: string
): Promise<void> {
  if (status !== 'APROVADO' && status !== 'REPROVADO') return
  await db.adsCoreRgStock.updateMany({
    where: { assetId, status: 'EM_USO' },
    data: { status: 'UTILIZADO' },
  })
}

/** Marca pares EM_USO do ativo como UTILIZADO antes de sortear novo par (identidade não reentra no pool). */
export async function supersedeAdsCoreRgStockForAsset(db: RgDb, assetId: string): Promise<void> {
  await db.adsCoreRgStock.updateMany({
    where: { assetId, status: 'EM_USO' },
    data: { status: 'UTILIZADO' },
  })
}
