import bcrypt from 'bcryptjs'
import type { ProductionAccount } from '@prisma/client'

const SALT_ROUNDS = 10

export async function hashProductionAccountPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export type ProductionAccountPublic<T extends ProductionAccount = ProductionAccount> = Omit<
  T,
  'passwordHash' | 'passwordPlain'
> & { hasPassword: boolean; passwordPlain?: string | null }

export function toProductionAccountPublic<T extends ProductionAccount>(
  account: T
): ProductionAccountPublic<T> {
  const { passwordHash, passwordPlain, ...rest } = account
  return {
    ...rest,
    hasPassword: !!passwordHash && passwordHash.length > 0,
    passwordPlain: passwordPlain ?? null,
  } as ProductionAccountPublic<T>
}

export function toProductionAccountPublicList<T extends ProductionAccount>(
  accounts: T[]
): ProductionAccountPublic<T>[] {
  return accounts.map(toProductionAccountPublic)
}
