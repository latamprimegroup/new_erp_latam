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

const KEY_GOOGLE = 'plugplay_valor_setup_google'
const KEY_FACEBOOK = 'plugplay_valor_setup_facebook'

export type PlugPlayUnitPrices = { google: number; facebook: number; fallback: number }

export async function getPlugPlayUnitPrices(): Promise<PlugPlayUnitPrices> {
  const fallback = await getPaymentPerAccount()
  const [g, f] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: KEY_GOOGLE } }),
    prisma.systemSetting.findUnique({ where: { key: KEY_FACEBOOK } }),
  ])
  const vGoogle = g ? parseInt(g.value, 10) : fallback
  const vFb = f ? parseInt(f.value, 10) : fallback
  return {
    google: Number.isFinite(vGoogle) ? vGoogle : fallback,
    facebook: Number.isFinite(vFb) ? vFb : fallback,
    fallback,
  }
}

export function pickPlugPlayUnit(prices: PlugPlayUnitPrices, platform: string | null | undefined): number {
  const p = (platform || 'GOOGLE_ADS').toUpperCase()
  if (p === 'FACEBOOK' || p === 'META') return prices.facebook
  return prices.google
}

/** Valor unitário de comissão por plataforma (prévia e criação de BlackPayment). */
export async function getPlugPlayUnitByPlatform(platform: string | null | undefined): Promise<number> {
  const prices = await getPlugPlayUnitPrices()
  return pickPlugPlayUnit(prices, platform)
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
  const now = new Date()
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const survived = await prisma.blackOperation.findMany({
    where: {
      status: 'LIVE',
      wentLiveAt: { lte: cutoff },
      payment: null,
    },
  })

  const prices = await getPlugPlayUnitPrices()
  let created = 0
  for (const op of survived) {
    const unit = pickPlugPlayUnit(prices, op.platform)
    await prisma.$transaction([
      prisma.blackOperation.update({
        where: { id: op.id },
        data: { status: 'SURVIVED_24H' },
      }),
      prisma.blackPayment.create({
        data: {
          operationId: op.id,
          collaboratorId: op.collaboratorId,
          amount: new Decimal(unit),
          status: 'PENDING',
        },
      }),
    ])
    created++
  }
  return created
}
