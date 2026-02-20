/**
 * Lógica de pagamento por conta que durou +24h com black no ar
 */

import { prisma } from './prisma'
import { Decimal } from '@prisma/client/runtime/library'

const PAYMENT_KEY = 'black_pagamento_por_conta_24h'

export async function getPaymentPerAccount(): Promise<number> {
  const s = await prisma.systemSetting.findUnique({ where: { key: PAYMENT_KEY } })
  return s ? parseInt(s.value, 10) : 50
}

export async function setPaymentPerAccount(value: number) {
  await prisma.systemSetting.upsert({
    where: { key: PAYMENT_KEY },
    create: { key: PAYMENT_KEY, value: String(value) },
    update: { value: String(value) },
  })
}

/**
 * Verifica operações LIVE que passaram de 24h e cria BlackPayment PENDING se ainda não existir
 */
export async function processSurvived24h(): Promise<number> {
  const paymentPerAccount = await getPaymentPerAccount()
  const now = new Date()
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const survived = await prisma.blackOperation.findMany({
    where: {
      status: 'LIVE',
      wentLiveAt: { lte: cutoff },
      payment: null,
    },
  })

  let created = 0
  for (const op of survived) {
    await prisma.$transaction([
      prisma.blackOperation.update({
        where: { id: op.id },
        data: { status: 'SURVIVED_24H' },
      }),
      prisma.blackPayment.create({
        data: {
          operationId: op.id,
          collaboratorId: op.collaboratorId,
          amount: new Decimal(paymentPerAccount),
          status: 'PENDING',
        },
      }),
    ])
    created++
  }
  return created
}
