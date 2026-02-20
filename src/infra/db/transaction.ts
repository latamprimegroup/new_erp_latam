/**
 * Camada de transações ACID
 * Wrapper sobre Prisma para uso em módulos
 */
import { prisma } from '@/lib/prisma'

export type PrismaTransactionClient = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

export async function withTransaction<T>(fn: (tx: PrismaTransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn as (tx: unknown) => Promise<T>)
}
