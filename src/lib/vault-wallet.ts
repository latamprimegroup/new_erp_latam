import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { dec } from '@/lib/vault-intelligence'

export async function getClientWalletBalance(clientId: string): Promise<Prisma.Decimal> {
  const last = await prisma.clientWalletLedger.findFirst({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    select: { balanceAfter: true },
  })
  return dec(last?.balanceAfter)
}

export async function postWalletDeposit(clientId: string, amount: number | Prisma.Decimal, memo?: string | null) {
  const a = dec(amount)
  if (a.lte(0)) throw new Error('Depósito deve ser > 0')
  const prev = await getClientWalletBalance(clientId)
  const next = prev.add(a)
  return prisma.clientWalletLedger.create({
    data: {
      clientId,
      type: 'DEPOSIT',
      amount: a,
      balanceAfter: next,
      memo: memo ?? null,
    },
  })
}
