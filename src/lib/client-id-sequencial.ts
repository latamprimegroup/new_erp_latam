/**
 * Gerador de ID Sequencial para Clientes (melhoria 009)
 * Padrão C288, C289, C290...
 */

import { prisma } from './prisma'

/**
 * Gera o próximo clientCode sequencial (ex: C289).
 * Usa transação para evitar conflitos em cadastros simultâneos.
 */
export async function generateNextClientId(): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const all = await tx.clientProfile.findMany({
      where: { clientCode: { not: null } },
      select: { clientCode: true },
    })

    let maxNum = 0
    for (const row of all) {
      const m = (row.clientCode || '').match(/^C(\d+)$/i)
      if (m) {
        const n = parseInt(m[1], 10)
        if (n > maxNum) maxNum = n
      }
    }

    return `C${maxNum + 1}`
  })
}
