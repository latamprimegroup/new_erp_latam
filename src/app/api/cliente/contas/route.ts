import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const accounts = await prisma.stockAccount.findMany({
    where: { clientId: client.id, status: { in: ['DELIVERED', 'IN_USE', 'CRITICAL'] } },
    include: {
      productionAccount: {
        select: { email: true, cnpj: true, platform: true },
      },
      spendLogs: {
        orderBy: { periodStart: 'desc' },
        take: 12,
      },
    },
    orderBy: { deliveredAt: 'desc' },
  })

  const totalSpend = await prisma.accountSpendLog.aggregate({
    where: { account: { clientId: client.id } },
    _sum: { costMicros: true },
  })

  const approvedCount = accounts.filter((a) => a.status === 'IN_USE').length
  const totalDelivered = accounts.length
  const approvalRate = totalDelivered > 0 ? (approvedCount / totalDelivered) * 100 : 0

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const monthSpend = await prisma.accountSpendLog.aggregate({
    where: {
      account: { clientId: client.id },
      periodStart: { lte: endOfMonth },
      periodEnd: { gte: startOfMonth },
    },
    _sum: { costMicros: true },
  })

  const totalCostMicros = totalSpend._sum.costMicros ?? BigInt(0)
  const monthCostMicros = monthSpend._sum.costMicros ?? BigInt(0)

  const sumSalePrice = accounts.reduce(
    (s, a) => s + (a.salePrice != null ? Number(a.salePrice) : 0),
    0,
  )
  const profileSpent = client.totalSpent != null ? Number(client.totalSpent) : 0
  const totalSpentOnAccounts = sumSalePrice > 0 ? sumSalePrice : profileSpent

  return NextResponse.json({
    accounts: accounts.map((a) => ({
      id: a.id,
      platform: a.platform,
      type: a.type,
      googleAdsCustomerId: a.googleAdsCustomerId,
      status: a.status,
      deliveredAt: a.deliveredAt,
      lastSpendSyncAt: a.lastSpendSyncAt,
      email: a.productionAccount?.email,
      cnpj: a.productionAccount?.cnpj,
      salePrice: a.salePrice ? Number(a.salePrice) : null,
      spendLogs: a.spendLogs.map((s) => ({
        periodStart: s.periodStart,
        periodEnd: s.periodEnd,
        cost: Number(s.costMicros) / 1_000_000,
        impressions: s.impressions,
        clicks: s.clicks,
        currencyCode: s.currencyCode,
      })),
    })),
    summary: {
      totalAccounts: totalDelivered,
      approvedCount,
      approvalRate,
      totalSpend: Number(totalCostMicros) / 1_000_000,
      monthSpend: Number(monthCostMicros) / 1_000_000,
      totalSpentOnAccounts,
    },
  })
}
