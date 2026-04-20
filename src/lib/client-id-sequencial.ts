/**
 * ID sequencial para clientes — padrão C001 / C288+ (prefixo C + número).
 * Concorrência: linha única em client_code_sequence + SELECT … FOR UPDATE (MySQL InnoDB).
 */

import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

type Tx = Prisma.TransactionClient

/** Formata número: C001…C999, depois C1000, C1001… */
export function formatClientCode(n: number): string {
  if (n < 1) return 'C001'
  if (n < 1000) return `C${String(n).padStart(3, '0')}`
  return `C${n}`
}

/** Maior sufixo numérico em client_code existentes (bootstrap da sequência). */
async function maxNumericFromClientProfiles(db: Tx | typeof prisma): Promise<number> {
  const rows = await db.clientProfile.findMany({
    where: { clientCode: { not: null } },
    select: { clientCode: true },
  })
  let max = 0
  for (const r of rows) {
    const m = (r.clientCode || '').match(/^C(\d+)$/i)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max
}

async function ensureSequenceRow(tx: Tx): Promise<void> {
  const row = await tx.clientCodeSequence.findUnique({ where: { id: 1 } })
  if (row) return
  const maxP = await maxNumericFromClientProfiles(tx)
  try {
    await tx.clientCodeSequence.create({
      data: { id: 1, lastNumber: maxP },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return
    throw e
  }
}

/**
 * Aloca o próximo código dentro de uma transação (uso interno).
 */
export async function allocateNextClientCode(tx: Tx): Promise<string> {
  await ensureSequenceRow(tx)
  await tx.$executeRaw`SELECT id FROM client_code_sequence WHERE id = 1 FOR UPDATE`
  const updated = await tx.clientCodeSequence.update({
    where: { id: 1 },
    data: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  })
  return formatClientCode(updated.lastNumber)
}

export async function generateNextClientId(): Promise<string> {
  return prisma.$transaction(async (tx) => allocateNextClientCode(tx))
}

/** Próximo ID sugerido (telas admin), sem consumir a sequência. */
export async function peekNextClientId(): Promise<string> {
  const row = await prisma.clientCodeSequence.findUnique({ where: { id: 1 } })
  const maxP = await maxNumericFromClientProfiles(prisma)
  const base = Math.max(row?.lastNumber ?? 0, maxP)
  return formatClientCode(base + 1)
}
