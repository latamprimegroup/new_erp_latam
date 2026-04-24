import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'
import { sendInApp } from '@/lib/notifications/channels/in-app'
import { sendTelegramSalesMessage } from '@/lib/telegram-sales'
import type { OrderStatus } from '@prisma/client'

type IncentiveConfig = {
  sellerGoalBrl: number
  sellerCommissionPct: number
  managerOverridePct: number
  productionBonusPerReadyAsset: number
  productionManagerBonusPerReadyAsset: number
  productionHealthScoreMin: number
}

const DEFAULT_CONFIG: IncentiveConfig = {
  sellerGoalBrl: 30_000,
  sellerCommissionPct: 5,
  managerOverridePct: 1,
  productionBonusPerReadyAsset: 10,
  productionManagerBonusPerReadyAsset: 5,
  productionHealthScoreMin: 70,
}

const PAID_LIKE_ORDER_STATUSES: OrderStatus[] = ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED']

const SETTING_KEYS = {
  sellerGoalBrl: 'incentive_seller_goal_brl',
  sellerCommissionPct: 'incentive_seller_commission_pct',
  managerOverridePct: 'incentive_manager_override_pct',
  productionBonusPerReadyAsset: 'incentive_production_bonus_ready_asset_brl',
  productionManagerBonusPerReadyAsset: 'incentive_production_manager_bonus_ready_asset_brl',
  productionHealthScoreMin: 'incentive_production_health_score_min',
} as const

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function toMoney(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function monthRange(ref: Date): { start: Date; end: Date } {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0)
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

export async function getIncentiveConfig(): Promise<IncentiveConfig> {
  const keys = Object.values(SETTING_KEYS)
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: keys } } })
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const pick = (key: string, fallback: number) => {
    const raw = map[key]
    if (!raw) return fallback
    const parsed = parseFloat(String(raw).replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return {
    sellerGoalBrl: pick(SETTING_KEYS.sellerGoalBrl, DEFAULT_CONFIG.sellerGoalBrl),
    sellerCommissionPct: pick(SETTING_KEYS.sellerCommissionPct, DEFAULT_CONFIG.sellerCommissionPct),
    managerOverridePct: pick(SETTING_KEYS.managerOverridePct, DEFAULT_CONFIG.managerOverridePct),
    productionBonusPerReadyAsset: pick(
      SETTING_KEYS.productionBonusPerReadyAsset,
      DEFAULT_CONFIG.productionBonusPerReadyAsset
    ),
    productionManagerBonusPerReadyAsset: pick(
      SETTING_KEYS.productionManagerBonusPerReadyAsset,
      DEFAULT_CONFIG.productionManagerBonusPerReadyAsset
    ),
    productionHealthScoreMin: pick(
      SETTING_KEYS.productionHealthScoreMin,
      DEFAULT_CONFIG.productionHealthScoreMin
    ),
  }
}

async function getSellerApprovedGrossRevenueInMonth(params: {
  sellerId: string
  paidAt: Date
  excludeOrderId?: string
  excludeQuickCheckoutId?: string
}): Promise<number> {
  const { start, end } = monthRange(params.paidAt)
  const orderWhere = {
    sellerId: params.sellerId,
    paidAt: { gte: start, lte: end },
    status: { in: PAID_LIKE_ORDER_STATUSES },
    ...(params.excludeOrderId ? { id: { not: params.excludeOrderId } } : {}),
  }
  const quickWhere = {
    sellerId: params.sellerId,
    paidAt: { gte: start, lte: end },
    status: 'PAID' as const,
    ...(params.excludeQuickCheckoutId ? { id: { not: params.excludeQuickCheckoutId } } : {}),
  }
  const [orderAgg, quickAgg] = await Promise.all([
    prisma.order.aggregate({ where: orderWhere, _sum: { value: true } }),
    prisma.quickSaleCheckout.aggregate({ where: quickWhere, _sum: { totalAmount: true } }),
  ])
  return Number(orderAgg._sum?.value ?? 0) + Number(quickAgg._sum?.totalAmount ?? 0)
}

export async function calculateCommercialIncentives(params: {
  grossValue: number
  supplierCost: number
  paidAt: Date
  sellerId?: string | null
  managerId?: string | null
  sellerCommissionPctOverride?: number | null
  excludeOrderId?: string
  excludeQuickCheckoutId?: string
}): Promise<{
  sellerCommission: number
  managerCommission: number
  netProfit: number
  sellerMetaUnlocked: boolean | null
  sellerRemainingToUnlock: number | null
  sellerMonthGrossBefore: number
  sellerMonthGrossAfter: number
  config: IncentiveConfig
}> {
  const config = await getIncentiveConfig()
  let sellerCommission = 0
  let sellerMetaUnlocked: boolean | null = null
  let sellerRemainingToUnlock: number | null = null
  let sellerMonthGrossBefore = 0
  let sellerMonthGrossAfter = 0

  if (params.sellerId) {
    sellerMonthGrossBefore = await getSellerApprovedGrossRevenueInMonth({
      sellerId: params.sellerId,
      paidAt: params.paidAt,
      excludeOrderId: params.excludeOrderId,
      excludeQuickCheckoutId: params.excludeQuickCheckoutId,
    })
    sellerMonthGrossAfter = sellerMonthGrossBefore + params.grossValue
    sellerMetaUnlocked = sellerMonthGrossBefore >= config.sellerGoalBrl
    const sellerRate = params.sellerCommissionPctOverride ?? config.sellerCommissionPct
    if (sellerMetaUnlocked) {
      sellerCommission = round2((params.grossValue * sellerRate) / 100)
    }
    sellerRemainingToUnlock = Math.max(0, round2(config.sellerGoalBrl - sellerMonthGrossAfter))
  }

  const managerCommission = params.managerId
    ? round2((params.grossValue * config.managerOverridePct) / 100)
    : 0
  const netProfit = round2(params.grossValue - params.supplierCost - sellerCommission - managerCommission)

  return {
    sellerCommission,
    managerCommission,
    netProfit,
    sellerMetaUnlocked,
    sellerRemainingToUnlock,
    sellerMonthGrossBefore,
    sellerMonthGrossAfter,
    config,
  }
}

export function computeOrderSupplierCost(orderItems: Array<{ quantity: number; account: { purchasePrice: unknown } | null }>): number {
  return round2(
    orderItems.reduce((sum, item) => {
      const price = Number(item.account?.purchasePrice ?? 0)
      return sum + price * Math.max(1, item.quantity || 1)
    }, 0)
  )
}

export function computeAssetSupplierCost(assets: Array<{ costPrice: unknown }>): number {
  return round2(assets.reduce((sum, asset) => sum + Number(asset.costPrice ?? 0), 0))
}

async function getLatestProductionHealthScore(userId: string): Promise<number> {
  const latest = await prisma.operatorScore.findFirst({
    where: { userId, setor: 'PRODUCAO' },
    orderBy: { referenceDate: 'desc' },
    select: { scoreGeral: true },
  })
  return latest?.scoreGeral ?? 100
}

export async function registerProductionReadyBonus(params: {
  technicianUserId: string
  referenceType: 'PRODUCTION' | 'G2'
  referenceId: string
  publicAssetId: string
  paidAt?: Date
}): Promise<void> {
  const config = await getIncentiveConfig()
  if (config.productionBonusPerReadyAsset <= 0) return

  const now = params.paidAt ?? new Date()
  const tokenTech = `[INCENTIVE_READY_BONUS:${params.referenceType}:${params.referenceId}:${params.technicianUserId}]`
  const existingTech = await prisma.financialEntry.findFirst({
    where: { category: 'BONUS_PRODUCAO_UNIDADE', description: { contains: tokenTech } },
    select: { id: true },
  })
  if (!existingTech) {
    await prisma.financialEntry.create({
      data: {
        type: 'EXPENSE',
        category: 'BONUS_PRODUCAO_UNIDADE',
        costCenter: params.technicianUserId,
        value: round2(config.productionBonusPerReadyAsset),
        date: now,
        entryStatus: 'PENDING',
        description: `${tokenTech} Bônus por ativo pronto: ${params.publicAssetId}`,
        reconciled: false,
      },
    })
  }

  const technician = await prisma.user.findUnique({
    where: { id: params.technicianUserId },
    select: { leaderId: true },
  })
  if (!technician?.leaderId || config.productionManagerBonusPerReadyAsset <= 0) return

  const health = await getLatestProductionHealthScore(params.technicianUserId)
  if (health < config.productionHealthScoreMin) return

  const tokenManager = `[INCENTIVE_MANAGER_READY_BONUS:${params.referenceType}:${params.referenceId}:${technician.leaderId}]`
  const existingManager = await prisma.financialEntry.findFirst({
    where: { category: 'BONUS_GERENTE_PRODUCAO', description: { contains: tokenManager } },
    select: { id: true },
  })
  if (existingManager) return

  await prisma.financialEntry.create({
    data: {
      type: 'EXPENSE',
      category: 'BONUS_GERENTE_PRODUCAO',
      costCenter: technician.leaderId,
      value: round2(config.productionManagerBonusPerReadyAsset),
      date: now,
      entryStatus: 'PENDING',
      description: `${tokenManager} Override produção (health ${health}) no ativo ${params.publicAssetId}`,
      reconciled: false,
    },
  })
}

export async function registerAssetReadyBonus(params: {
  assetId: string
  referenceType: 'PRODUCTION' | 'G2' | 'QUICK_SALE'
  referenceId: string
  paidAt?: Date
}): Promise<void> {
  const asset = await prisma.asset.findUnique({
    where: { id: params.assetId },
    select: {
      id: true,
      adsId: true,
      movements: {
        where: { toStatus: 'AVAILABLE', userId: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { userId: true },
      },
    },
  })
  const technicianUserId = asset?.movements[0]?.userId ?? null
  if (!technicianUserId) return

  await registerProductionReadyBonus({
    technicianUserId,
    referenceType: params.referenceType === 'G2' ? 'G2' : 'PRODUCTION',
    referenceId: `${params.referenceType}:${params.referenceId}:${params.assetId}`,
    publicAssetId: asset?.adsId || params.assetId,
    paidAt: params.paidAt,
  })
}

export function getMonthlyWindowUtc(year: number, month: number): { start: Date; end: Date } {
  const safeMonth = Math.min(12, Math.max(1, month))
  const start = new Date(Date.UTC(year, safeMonth - 1, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, safeMonth, 0, 23, 59, 59, 999))
  return { start, end }
}

export async function getUserRevenueForMonth(userId: string, start: Date, end: Date): Promise<{
  grossBrl: number
  ordersCount: number
  quickSalesCount: number
}> {
  const [orderAgg, orderCount, quickAgg, quickCount] = await Promise.all([
    prisma.order.aggregate({
      where: {
        sellerId: userId,
        paidAt: { gte: start, lte: end },
        status: { in: ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] },
      },
      _sum: { value: true },
    }),
    prisma.order.count({
      where: {
        sellerId: userId,
        paidAt: { gte: start, lte: end },
        status: { in: ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] },
      },
    }),
    prisma.quickSaleCheckout.aggregate({
      where: {
        sellerId: userId,
        paidAt: { gte: start, lte: end },
        status: 'PAID',
      },
      _sum: { totalAmount: true },
    }),
    prisma.quickSaleCheckout.count({
      where: {
        sellerId: userId,
        paidAt: { gte: start, lte: end },
        status: 'PAID',
      },
    }),
  ])

  return {
    grossBrl: round2(Number(orderAgg._sum.value ?? 0) + Number(quickAgg._sum.totalAmount ?? 0)),
    ordersCount: orderCount,
    quickSalesCount: quickCount,
  }
}

export async function getTeamRevenueForMonth(managerUserId: string, start: Date, end: Date): Promise<{
  grossBrl: number
  sellersCount: number
  sellers: Array<{ sellerId: string; sellerName: string; grossBrl: number }>
}> {
  const sellers = await prisma.user.findMany({
    where: { leaderId: managerUserId, role: 'COMMERCIAL' },
    select: { id: true, name: true, email: true },
  })
  if (sellers.length === 0) {
    return { grossBrl: 0, sellersCount: 0, sellers: [] }
  }

  const sellerRows = await Promise.all(
    sellers.map(async (s) => {
      const revenue = await getUserRevenueForMonth(s.id, start, end)
      return {
        sellerId: s.id,
        sellerName: s.name || s.email,
        grossBrl: revenue.grossBrl,
      }
    })
  )

  return {
    grossBrl: round2(sellerRows.reduce((sum, s) => sum + s.grossBrl, 0)),
    sellersCount: sellers.length,
    sellers: sellerRows.sort((a, b) => b.grossBrl - a.grossBrl),
  }
}

export async function getSalesCheckoutIncentiveBreakdown(checkoutId: string): Promise<{
  sellerId: string | null
  sellerName: string
  managerId: string | null
  managerName: string
  grossValue: number
  supplierCost: number
  sellerCommission: number
  managerCommission: number
  netProfit: number
  sellerMetaUnlocked: boolean | null
  sellerRemainingToUnlock: number | null
  nicheForReplenishment: string
  displayName: string
}> {
  const checkout = await prisma.salesCheckout.findUnique({
    where: { id: checkoutId },
    include: {
      lead: true,
    },
  })
  if (!checkout) {
    return {
      sellerId: null,
      sellerName: 'N/A',
      managerId: null,
      managerName: 'N/A',
      grossValue: 0,
      supplierCost: 0,
      sellerCommission: 0,
      managerCommission: 0,
      netProfit: 0,
      sellerMetaUnlocked: null,
      sellerRemainingToUnlock: null,
      nicheForReplenishment: 'AUTHORITY_GERAL',
      displayName: checkoutId,
    }
  }

  const linkedUser =
    checkout.lead.email
      ? await prisma.user.findUnique({
          where: { email: checkout.lead.email },
          select: {
            id: true,
            name: true,
            email: true,
            commissionRate: true,
            leader: { select: { id: true, name: true, email: true } },
          },
        })
      : null
  const sellerId = linkedUser?.id ?? null
  const managerId = linkedUser?.leader?.id ?? null
  const asset = checkout.assetId
    ? await prisma.asset.findUnique({
        where: { id: checkout.assetId },
        select: { costPrice: true, displayName: true, specs: true },
      })
    : null
  const grossValue = Number(checkout.amount ?? 0)
  const supplierCost = round2(Number(asset?.costPrice ?? 0))
  const calc = await calculateCommercialIncentives({
    grossValue,
    supplierCost,
    paidAt: checkout.paidAt ?? new Date(),
    sellerId,
    managerId,
    sellerCommissionPctOverride: linkedUser?.commissionRate != null ? Number(linkedUser.commissionRate) : null,
  })
  const specs = asset?.specs as Record<string, unknown> | undefined
  const nicheForReplenishment =
    typeof specs?.authorityTag === 'string'
      ? specs.authorityTag
      : 'AUTHORITY_GERAL'

  return {
    sellerId,
    sellerName: linkedUser?.name || linkedUser?.email || 'N/A',
    managerId,
    managerName: linkedUser?.leader?.name || linkedUser?.leader?.email || 'N/A',
    grossValue,
    supplierCost,
    sellerCommission: calc.sellerCommission,
    managerCommission: calc.managerCommission,
    netProfit: calc.netProfit,
    sellerMetaUnlocked: calc.sellerMetaUnlocked,
    sellerRemainingToUnlock: calc.sellerRemainingToUnlock,
    nicheForReplenishment,
    displayName: asset?.displayName || checkout.adsId,
  }
}

export async function calculateOrderIncentiveBreakdown(orderId: string): Promise<{
  sellerId: string | null
  sellerName: string
  managerId: string | null
  managerName: string
  grossValue: number
  supplierCost: number
  sellerCommission: number
  managerCommission: number
  netProfit: number
  sellerMetaUnlocked: boolean | null
  sellerRemainingToUnlock: number | null
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      seller: {
        select: {
          id: true,
          name: true,
          email: true,
          commissionRate: true,
          leaderId: true,
          leader: { select: { id: true, name: true, email: true } },
        },
      },
      items: { include: { account: { select: { purchasePrice: true } } } },
    },
  })
  if (!order) {
    return {
      sellerId: null,
      sellerName: 'N/A',
      managerId: null,
      managerName: 'N/A',
      grossValue: 0,
      supplierCost: 0,
      sellerCommission: 0,
      managerCommission: 0,
      netProfit: 0,
      sellerMetaUnlocked: null,
      sellerRemainingToUnlock: null,
    }
  }

  const sellerId = order.seller?.id ?? null
  const managerId = order.seller?.leader?.id ?? null
  const grossValue = Number(order.value ?? 0)
  const supplierCost = computeOrderSupplierCost(order.items || [])
  const calc = await calculateCommercialIncentives({
    grossValue,
    supplierCost,
    paidAt: order.paidAt ?? new Date(),
    sellerId,
    managerId,
    sellerCommissionPctOverride: order.seller?.commissionRate != null ? Number(order.seller.commissionRate) : null,
    excludeOrderId: order.id,
  })

  return {
    sellerId,
    sellerName: order.seller?.name || order.seller?.email || 'N/A',
    managerId,
    managerName: order.seller?.leader?.name || order.seller?.leader?.email || 'N/A',
    grossValue,
    supplierCost,
    sellerCommission: calc.sellerCommission,
    managerCommission: calc.managerCommission,
    netProfit: calc.netProfit,
    sellerMetaUnlocked: calc.sellerMetaUnlocked,
    sellerRemainingToUnlock: calc.sellerRemainingToUnlock,
  }
}

export async function calculateQuickSaleIncentiveBreakdown(quickSaleCheckoutId: string): Promise<{
  sellerId: string | null
  sellerName: string
  managerId: string | null
  managerName: string
  publicAssetId: string
  grossValue: number
  supplierCost: number
  sellerCommission: number
  managerCommission: number
  netProfit: number
  sellerMetaUnlocked: boolean | null
  sellerRemainingToUnlock: number | null
  nicheForReplenishment: string
}> {
  const checkout = await prisma.quickSaleCheckout.findUnique({
    where: { id: quickSaleCheckoutId },
    include: {
      listing: { select: { title: true, assetCategory: true, createdBy: true } },
      seller: {
        select: {
          id: true,
          name: true,
          email: true,
          commissionRate: true,
          leaderId: true,
          leader: { select: { id: true, name: true, email: true } },
        },
      },
    },
  })
  if (!checkout) {
    return {
      sellerId: null,
      sellerName: 'N/A',
      managerId: null,
      managerName: 'N/A',
      publicAssetId: quickSaleCheckoutId,
      grossValue: 0,
      supplierCost: 0,
      sellerCommission: 0,
      managerCommission: 0,
      netProfit: 0,
      sellerMetaUnlocked: null,
      sellerRemainingToUnlock: null,
      nicheForReplenishment: 'AUTHORITY_GERAL',
    }
  }

  const sellerId = checkout.sellerId ?? checkout.listing.createdBy ?? null
  const seller =
    checkout.seller ??
    (sellerId
      ? await prisma.user.findUnique({
          where: { id: sellerId },
          select: {
            id: true,
            name: true,
            email: true,
            commissionRate: true,
            leaderId: true,
            leader: { select: { id: true, name: true, email: true } },
          },
        })
      : null)
  const managerId = checkout.managerId ?? seller?.leader?.id ?? null
  const manager =
    checkout.managerId
      ? await prisma.user.findUnique({
          where: { id: checkout.managerId },
          select: { id: true, name: true, email: true },
        })
      : seller?.leader ?? null
  const assetIds = Array.isArray(checkout.reservedAssetIds) ? (checkout.reservedAssetIds as string[]) : []
  const assets = assetIds.length
    ? await prisma.asset.findMany({
        where: { id: { in: assetIds } },
        select: { costPrice: true, specs: true, adsId: true },
      })
    : []
  const grossValue = Number(checkout.totalAmount ?? 0)
  const supplierCost = computeAssetSupplierCost(assets)
  const calc = await calculateCommercialIncentives({
    grossValue,
    supplierCost,
    paidAt: checkout.paidAt ?? new Date(),
    sellerId,
    managerId,
    sellerCommissionPctOverride: seller?.commissionRate != null ? Number(seller.commissionRate) : null,
    excludeQuickCheckoutId: checkout.id,
  })
  const firstSpecs = assets[0]?.specs as Record<string, unknown> | undefined
  const nicheForReplenishment =
    typeof firstSpecs?.authorityTag === 'string'
      ? firstSpecs.authorityTag
      : checkout.listing.assetCategory || 'AUTHORITY_GERAL'
  const publicAssetId = assets[0]?.adsId ?? quickSaleCheckoutId

  return {
    sellerId,
    sellerName: seller?.name || seller?.email || 'N/A',
    managerId,
    managerName: manager?.name || manager?.email || 'N/A',
    publicAssetId,
    grossValue,
    supplierCost,
    sellerCommission: calc.sellerCommission,
    managerCommission: calc.managerCommission,
    netProfit: calc.netProfit,
    sellerMetaUnlocked: calc.sellerMetaUnlocked,
    sellerRemainingToUnlock: calc.sellerRemainingToUnlock,
    nicheForReplenishment,
  }
}

export async function registerQuickSaleProductionBonus(params: {
  quickCheckoutId: string
  assetIds: string[]
  paidAt: Date
}): Promise<void> {
  if (params.assetIds.length === 0) return
  const assets = await prisma.asset.findMany({
    where: { id: { in: params.assetIds } },
    select: { id: true },
  })
  if (assets.length > 0) {
    await Promise.allSettled(
      assets.map((asset) =>
        registerAssetReadyBonus({
          assetId: asset.id,
          referenceType: 'QUICK_SALE',
          referenceId: params.quickCheckoutId,
          paidAt: params.paidAt,
        })
      )
    )
  }

}

export async function getMonthlyIncentiveExtract(params: {
  month: number
  year: number
  sellerId?: string
  limit?: number
}): Promise<{
  rows: Array<{
    orderId: string
    paidAt: string | null
    sellerId: string | null
    sellerName: string | null
    grossBrl: number
    supplierCostBrl: number
    sellerCommissionBrl: number
    managerCommissionBrl: number
    netProfitBrl: number
    sellerMetaUnlocked: boolean
    paymentMethod: string | null
  }>
  summary: {
    grossBrl: number
    supplierCostBrl: number
    sellerCommissionBrl: number
    managerCommissionBrl: number
    netProfitBrl: number
  }
}> {
  const { start, end } = getMonthlyWindowUtc(params.year, params.month)
  const take = Math.max(1, Math.min(500, params.limit ?? 200))

  const [orders, quickSales] = await Promise.all([
    prisma.order.findMany({
      where: {
        paidAt: { gte: start, lte: end },
        status: { in: ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] },
        ...(params.sellerId ? { sellerId: params.sellerId } : {}),
      },
      select: {
        id: true,
        paidAt: true,
        sellerId: true,
        paymentMethod: true,
        value: true,
        supplierCost: true,
        sellerCommission: true,
        managerCommission: true,
        netProfit: true,
        sellerMetaUnlocked: true,
        seller: { select: { name: true, email: true } },
      },
      orderBy: { paidAt: 'desc' },
      take,
    }),
    prisma.quickSaleCheckout.findMany({
      where: {
        paidAt: { gte: start, lte: end },
        status: 'PAID',
        ...(params.sellerId ? { sellerId: params.sellerId } : {}),
      },
      select: {
        id: true,
        paidAt: true,
        sellerId: true,
        totalAmount: true,
        supplierCost: true,
        sellerCommission: true,
        managerCommission: true,
        netProfit: true,
        sellerMetaUnlocked: true,
        seller: { select: { name: true, email: true } },
      },
      orderBy: { paidAt: 'desc' },
      take,
    }),
  ])

  const rows = [
    ...orders.map((o) => ({
      orderId: o.id,
      paidAt: o.paidAt ? o.paidAt.toISOString() : null,
      sellerId: o.sellerId ?? null,
      sellerName: o.seller?.name || o.seller?.email || null,
      grossBrl: round2(Number(o.value ?? 0)),
      supplierCostBrl: round2(Number(o.supplierCost ?? 0)),
      sellerCommissionBrl: round2(Number(o.sellerCommission ?? 0)),
      managerCommissionBrl: round2(Number(o.managerCommission ?? 0)),
      netProfitBrl: round2(Number(o.netProfit ?? 0)),
      sellerMetaUnlocked: Boolean(o.sellerMetaUnlocked),
      paymentMethod: o.paymentMethod ?? null,
    })),
    ...quickSales.map((q) => ({
      orderId: q.id,
      paidAt: q.paidAt ? q.paidAt.toISOString() : null,
      sellerId: q.sellerId ?? null,
      sellerName: q.seller?.name || q.seller?.email || null,
      grossBrl: round2(Number(q.totalAmount ?? 0)),
      supplierCostBrl: round2(Number(q.supplierCost ?? 0)),
      sellerCommissionBrl: round2(Number(q.sellerCommission ?? 0)),
      managerCommissionBrl: round2(Number(q.managerCommission ?? 0)),
      netProfitBrl: round2(Number(q.netProfit ?? 0)),
      sellerMetaUnlocked: Boolean(q.sellerMetaUnlocked),
      paymentMethod: 'PIX',
    })),
  ].sort((a, b) => {
    const ta = a.paidAt ? new Date(a.paidAt).getTime() : 0
    const tb = b.paidAt ? new Date(b.paidAt).getTime() : 0
    return tb - ta
  })

  return {
    rows,
    summary: {
      grossBrl: round2(rows.reduce((s, r) => s + r.grossBrl, 0)),
      supplierCostBrl: round2(rows.reduce((s, r) => s + r.supplierCostBrl, 0)),
      sellerCommissionBrl: round2(rows.reduce((s, r) => s + r.sellerCommissionBrl, 0)),
      managerCommissionBrl: round2(rows.reduce((s, r) => s + r.managerCommissionBrl, 0)),
      netProfitBrl: round2(rows.reduce((s, r) => s + r.netProfitBrl, 0)),
    },
  }
}
