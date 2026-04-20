import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getProductionConfig } from '@/lib/production-payment'
import { dec } from '@/lib/vault-intelligence'

export async function getOrOpenProducerVaultCycle(userId: string) {
  const existing = await prisma.producerVaultCycle.findFirst({
    where: { userId, status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
  })
  if (existing) return existing
  return prisma.producerVaultCycle.create({
    data: { userId, openedAt: new Date(), status: 'OPEN' },
  })
}

export type CommissionLogLine = {
  kind: 'PRODUCAO_G1' | 'PRODUCAO_G2' | 'ELITE_24H'
  occurredAt: string
  ref: string
  description: string
  amount: number
}

/** Extrato linha a linha: cada unidade validada e cada elite 24h (transparência para o colaborador). */
export async function getCommissionDetailLog(userId: string, since: Date): Promise<{
  lines: CommissionLogLine[]
  subtotalBase: number
  subtotalElite: number
  total: number
}> {
  const cfg = await getProductionConfig()
  const per = cfg.valorPorConta
  const eliteBonus = cfg.bonusElite
  const survivalCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [paList, g2List] = await Promise.all([
    prisma.productionAccount.findMany({
      where: {
        producerId: userId,
        status: 'APPROVED',
        deletedAt: null,
        validatedAt: { gte: since },
      },
      select: { id: true, validatedAt: true, platform: true, type: true },
      orderBy: { validatedAt: 'asc' },
    }),
    prisma.productionG2.findMany({
      where: { creatorId: userId, deletedAt: null, validatedAt: { gte: since } },
      select: {
        id: true,
        validatedAt: true,
        codeG2: true,
        stockAccount: { select: { deliveredAt: true, status: true } },
      },
      orderBy: { validatedAt: 'asc' },
    }),
  ])

  const lines: CommissionLogLine[] = []
  let subtotalBase = 0
  let subtotalElite = 0

  for (const p of paList) {
    if (!p.validatedAt) continue
    lines.push({
      kind: 'PRODUCAO_G1',
      occurredAt: p.validatedAt.toISOString(),
      ref: p.id.slice(-10),
      description: `Produção G1 — ${p.platform} · ${p.type}`,
      amount: per,
    })
    subtotalBase += per
  }

  for (const g of g2List) {
    if (!g.validatedAt) continue
    lines.push({
      kind: 'PRODUCAO_G2',
      occurredAt: g.validatedAt.toISOString(),
      ref: g.codeG2,
      description: 'Produção G2 — unidade validada',
      amount: per,
    })
    subtotalBase += per
    const sa = g.stockAccount
    if (
      sa?.deliveredAt &&
      sa.deliveredAt <= survivalCutoff &&
      ['IN_USE', 'DELIVERED', 'CRITICAL'].includes(sa.status)
    ) {
      lines.push({
        kind: 'ELITE_24H',
        occurredAt: g.validatedAt.toISOString(),
        ref: g.codeG2,
        description: 'Bônus Elite — conta entregue há ≥24h e ativa',
        amount: eliteBonus,
      })
      subtotalElite += eliteBonus
    }
  }

  return {
    lines,
    subtotalBase,
    subtotalElite,
    total: subtotalBase + subtotalElite,
  }
}

export async function computeLiveProducerProvision(userId: string, since: Date) {
  const cfg = await getProductionConfig()
  const per = dec(cfg.valorPorConta)
  const eliteVal = dec(cfg.bonusElite)
  const survivalCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [prodCount, g2Count, eliteCount] = await Promise.all([
    prisma.productionAccount.count({
      where: {
        producerId: userId,
        status: 'APPROVED',
        deletedAt: null,
        validatedAt: { gte: since },
      },
    }),
    prisma.productionG2.count({
      where: {
        creatorId: userId,
        deletedAt: null,
        validatedAt: { gte: since },
      },
    }),
    prisma.productionG2.count({
      where: {
        creatorId: userId,
        deletedAt: null,
        validatedAt: { gte: since },
        stockAccountId: { not: null },
        stockAccount: {
          deliveredAt: { not: null, lte: survivalCutoff },
          status: { in: ['IN_USE', 'DELIVERED', 'CRITICAL'] },
        },
      },
    }),
  ])

  const provisionedProduction = per.mul(prodCount + g2Count)
  const provisionedElite = eliteVal.mul(eliteCount)
  return {
    unitsProduction: prodCount + g2Count,
    unitsElite: eliteCount,
    provisionedProduction,
    provisionedElite,
    total: provisionedProduction.add(provisionedElite),
    config: {
      valorPorConta: cfg.valorPorConta,
      bonusElite: cfg.bonusElite,
    },
  }
}

export async function closeProducerVaultCycle(userId: string, closedById: string) {
  const open = await getOrOpenProducerVaultCycle(userId)
  const live = await computeLiveProducerProvision(userId, open.openedAt)
  const commissionLog = await getCommissionDetailLog(userId, open.openedAt)
  const report = {
    closedAt: new Date().toISOString(),
    openedAt: open.openedAt.toISOString(),
    ...live,
    provisionedProduction: live.provisionedProduction.toNumber(),
    provisionedElite: live.provisionedElite.toNumber(),
    total: live.total.toNumber(),
    closedById,
    commissionLines: commissionLog.lines,
    commissionLineCount: commissionLog.lines.length,
  }

  await prisma.$transaction([
    prisma.producerVaultCycle.update({
      where: { id: open.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        provisionedProduction: live.provisionedProduction,
        provisionedElite: live.provisionedElite,
        unitsProductionCounted: live.unitsProduction,
        unitsEliteCounted: live.unitsElite,
        closedReportJson: report as object,
      },
    }),
    prisma.producerVaultCycle.create({
      data: {
        userId,
        openedAt: new Date(),
        status: 'OPEN',
      },
    }),
  ])

  return { previousCycleId: open.id, report }
}
