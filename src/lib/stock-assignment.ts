/**
 * Serviço de atribuição exclusiva de dados do estoque
 * Garante que email/CNPJ/perfil nunca seja atribuído a mais de um produtor
 * e nunca seja reutilizado em outra conta
 */

import { prisma } from './prisma'
import type { StockItemStatus } from '@prisma/client'

type ReserveResult = {
  ok: boolean
  error?: string
  item?: unknown
}

/**
 * Reserva um email para o produtor (status -> RESERVED)
 * Só itens AVAILABLE podem ser reservados
 */
export async function reserveEmail(emailId: string, producerId: string): Promise<ReserveResult> {
  const email = await prisma.email.findUnique({ where: { id: emailId } })
  if (!email) return { ok: false, error: 'E-mail não encontrado' }
  if (email.status !== 'AVAILABLE') {
    return { ok: false, error: 'E-mail já está em uso ou reservado' }
  }

  const updated = await prisma.email.update({
    where: { id: emailId },
    data: {
      status: 'RESERVED',
      assignedToProducerId: producerId,
      assignedAt: new Date(),
    },
  })
  return { ok: true, item: updated }
}

/**
 * Reserva um CNPJ para o produtor
 */
export async function reserveCnpj(cnpjId: string, producerId: string): Promise<ReserveResult> {
  const cnpj = await prisma.cnpj.findUnique({ where: { id: cnpjId } })
  if (!cnpj) return { ok: false, error: 'CNPJ não encontrado' }
  if (cnpj.status !== 'AVAILABLE') {
    return { ok: false, error: 'CNPJ já está em uso ou reservado' }
  }

  const updated = await prisma.cnpj.update({
    where: { id: cnpjId },
    data: {
      status: 'RESERVED',
      assignedToProducerId: producerId,
      assignedAt: new Date(),
    },
  })
  return { ok: true, item: updated }
}

/**
 * Reserva um perfil de pagamento para o produtor
 */
export async function reservePaymentProfile(profileId: string, producerId: string): Promise<ReserveResult> {
  const profile = await prisma.paymentProfile.findUnique({ where: { id: profileId } })
  if (!profile) return { ok: false, error: 'Perfil não encontrado' }
  if (profile.status !== 'AVAILABLE') {
    return { ok: false, error: 'Perfil já está em uso ou reservado' }
  }

  const updated = await prisma.paymentProfile.update({
    where: { id: profileId },
    data: {
      status: 'RESERVED',
      assignedToProducerId: producerId,
      assignedAt: new Date(),
    },
  })
  return { ok: true, item: updated }
}

/**
 * Marca email como consumido (usado em produção)
 */
export async function consumeEmail(emailId: string, productionAccountId: string): Promise<ReserveResult> {
  const email = await prisma.email.findUnique({ where: { id: emailId } })
  if (!email) return { ok: false, error: 'E-mail não encontrado' }
  if (email.status === 'CONSUMED') return { ok: false, error: 'E-mail já foi consumido' }

  await prisma.email.update({
    where: { id: emailId },
    data: {
      status: 'CONSUMED',
      consumedAt: new Date(),
      assignedToProducerId: null,
      assignedAt: null,
    },
  })

  await prisma.productionAccount.update({
    where: { id: productionAccountId },
    data: { emailId },
  })
  return { ok: true }
}

/**
 * Marca CNPJ como consumido
 */
export async function consumeCnpj(cnpjId: string, productionAccountId: string): Promise<ReserveResult> {
  const cnpj = await prisma.cnpj.findUnique({ where: { id: cnpjId } })
  if (!cnpj) return { ok: false, error: 'CNPJ não encontrado' }
  if (cnpj.status === 'CONSUMED') return { ok: false, error: 'CNPJ já foi consumido' }

  await prisma.cnpj.update({
    where: { id: cnpjId },
    data: {
      status: 'CONSUMED',
      consumedAt: new Date(),
      assignedToProducerId: null,
      assignedAt: null,
    },
  })

  await prisma.productionAccount.update({
    where: { id: productionAccountId },
    data: { cnpjId },
  })
  return { ok: true }
}

/**
 * Marca perfil de pagamento como consumido
 */
export async function consumePaymentProfile(
  profileId: string,
  productionAccountId: string
): Promise<ReserveResult> {
  const profile = await prisma.paymentProfile.findUnique({ where: { id: profileId } })
  if (!profile) return { ok: false, error: 'Perfil não encontrado' }
  if (profile.status === 'CONSUMED') return { ok: false, error: 'Perfil já foi consumido' }

  await prisma.paymentProfile.update({
    where: { id: profileId },
    data: {
      status: 'CONSUMED',
      consumedAt: new Date(),
      assignedToProducerId: null,
      assignedAt: null,
    },
  })

  await prisma.productionAccount.update({
    where: { id: productionAccountId },
    data: { paymentProfileId: profileId },
  })
  return { ok: true }
}

/**
 * Libera reserva (devolve ao estoque) - apenas se ainda RESERVED
 */
export async function releaseEmail(emailId: string, producerId: string): Promise<ReserveResult> {
  const email = await prisma.email.findUnique({ where: { id: emailId } })
  if (!email) return { ok: false, error: 'E-mail não encontrado' }
  if (email.status !== 'RESERVED') return { ok: false, error: 'E-mail não está reservado' }
  if (email.assignedToProducerId !== producerId) {
    return { ok: false, error: 'Este e-mail foi reservado por outro produtor' }
  }

  await prisma.email.update({
    where: { id: emailId },
    data: {
      status: 'AVAILABLE',
      assignedToProducerId: null,
      assignedAt: null,
    },
  })
  return { ok: true }
}

export async function releaseCnpj(cnpjId: string, producerId: string): Promise<ReserveResult> {
  const cnpj = await prisma.cnpj.findUnique({ where: { id: cnpjId } })
  if (!cnpj) return { ok: false, error: 'CNPJ não encontrado' }
  if (cnpj.status !== 'RESERVED') return { ok: false, error: 'CNPJ não está reservado' }
  if (cnpj.assignedToProducerId !== producerId) {
    return { ok: false, error: 'Este CNPJ foi reservado por outro produtor' }
  }

  await prisma.cnpj.update({
    where: { id: cnpjId },
    data: {
      status: 'AVAILABLE',
      assignedToProducerId: null,
      assignedAt: null,
    },
  })
  return { ok: true }
}

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * Consome itens da base para ProductionG2 (marca CONSUMED, vincula ao G2)
 * Aceita tx opcional para uso em transações.
 */
export async function consumeForProductionG2(
  productionG2Id: string,
  producerId: string,
  params: { emailId?: string; cnpjId?: string; paymentProfileId?: string },
  txOrPrisma?: PrismaTx | typeof prisma
): Promise<ReserveResult> {
  const db = txOrPrisma ?? prisma
  const { emailId, cnpjId, paymentProfileId } = params
  if (emailId) {
    const email = await db.email.findUnique({ where: { id: emailId } })
    if (!email) return { ok: false, error: 'E-mail não encontrado' }
    if (email.status !== 'RESERVED' || email.assignedToProducerId !== producerId) {
      return { ok: false, error: 'E-mail não está reservado para você' }
    }
    await db.email.update({
      where: { id: emailId },
      data: { status: 'CONSUMED', consumedAt: new Date(), assignedToProducerId: null, assignedAt: null },
    })
    await db.productionG2.update({
      where: { id: productionG2Id },
      data: { emailId },
    })
  }
  if (cnpjId) {
    const cnpj = await db.cnpj.findUnique({ where: { id: cnpjId } })
    if (!cnpj) return { ok: false, error: 'CNPJ não encontrado' }
    if (cnpj.status !== 'RESERVED' || cnpj.assignedToProducerId !== producerId) {
      return { ok: false, error: 'CNPJ não está reservado para você' }
    }
    await db.cnpj.update({
      where: { id: cnpjId },
      data: { status: 'CONSUMED', consumedAt: new Date(), assignedToProducerId: null, assignedAt: null },
    })
    await db.productionG2.update({
      where: { id: productionG2Id },
      data: { cnpjId },
    })
  }
  if (paymentProfileId) {
    const profile = await db.paymentProfile.findUnique({ where: { id: paymentProfileId } })
    if (!profile) return { ok: false, error: 'Perfil não encontrado' }
    if (profile.status !== 'RESERVED' || profile.assignedToProducerId !== producerId) {
      return { ok: false, error: 'Perfil não está reservado para você' }
    }
    await db.paymentProfile.update({
      where: { id: paymentProfileId },
      data: { status: 'CONSUMED', consumedAt: new Date(), assignedToProducerId: null, assignedAt: null },
    })
    await db.productionG2.update({
      where: { id: productionG2Id },
      data: { paymentProfileId },
    })
  }
  return { ok: true }
}

export async function releasePaymentProfile(profileId: string, producerId: string): Promise<ReserveResult> {
  const profile = await prisma.paymentProfile.findUnique({ where: { id: profileId } })
  if (!profile) return { ok: false, error: 'Perfil não encontrado' }
  if (profile.status !== 'RESERVED') return { ok: false, error: 'Perfil não está reservado' }
  if (profile.assignedToProducerId !== producerId) {
    return { ok: false, error: 'Este perfil foi reservado por outro produtor' }
  }

  await prisma.paymentProfile.update({
    where: { id: profileId },
    data: {
      status: 'AVAILABLE',
      assignedToProducerId: null,
      assignedAt: null,
    },
  })
  return { ok: true }
}
