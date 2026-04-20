import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { AccountPlatform, AccountStatus, type Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { brtDayBoundsUtc } from '@/lib/roi-crm-queries'

const createSchema = z.object({
  platform: z.enum(['GOOGLE_ADS', 'META_ADS', 'KWAI_ADS', 'TIKTOK_ADS', 'OTHER']),
  type: z.string().min(1),
  yearStarted: z.number().int().optional(),
  niche: z.string().optional(),
  minConsumed: z.number().optional(),
  purchasePrice: z.number().optional(),
  salePrice: z.number().optional(),
  markupPercent: z.number().optional(),
  description: z.string().optional(),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const status = searchParams.get('status')
  const platform = searchParams.get('platform')
  const archived = searchParams.get('archived') // 'true' = só arquivadas, 'false' ou omitido = só não arquivadas (venda)
  const plugPlayOnly = searchParams.get('plugPlayOnly') === 'true'
  const q = searchParams.get('q')?.trim() ?? ''

  const clauses: Prisma.StockAccountWhereInput[] = [{ deletedAt: null }]
  if (type) clauses.push({ type })
  if (status && (Object.values(AccountStatus) as string[]).includes(status)) {
    clauses.push({ status: status as AccountStatus })
  }
  if (platform && (Object.values(AccountPlatform) as string[]).includes(platform)) {
    clauses.push({ platform: platform as AccountPlatform })
  }
  if (plugPlayOnly) clauses.push({ isPlugPlay: true })
  if (archived === 'true') clauses.push({ archivedAt: { not: null } })
  else clauses.push({ archivedAt: null })
  if (q.length > 0) {
    clauses.push({
      OR: [
        { id: { startsWith: q } },
        { niche: { contains: q } },
        { description: { contains: q } },
        { type: { contains: q } },
      ],
    })
  }

  const where: Prisma.StockAccountWhereInput =
    clauses.length === 1 ? clauses[0]! : { AND: clauses }

  const todayYmd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const brtToday = brtDayBoundsUtc(todayYmd)

  const [settings, accounts, criticalCount, byStatusRows, lowStockGroups, salesToday, stockByPlatformRows] =
    await Promise.all([
    prisma.systemSetting.findMany({
      where: {
        key: {
          in: ['estoque_minimo', 'estoque_minimo_per_faixa', 'estoque_dias_alerta_validade'],
        },
      },
    }),
    prisma.stockAccount.findMany({
      where,
      include: {
        manager: { include: { user: { select: { name: true } } } },
        productionG2: {
          select: {
            status: true,
            firstCampaignWhiteApproved: true,
            approvedAt: true,
            sentToStockAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.stockAccount.count({ where: { ...where, status: 'CRITICAL' } }),
    prisma.stockAccount.groupBy({
      by: ['status'],
      where,
      _count: { id: true },
    }),
    archived !== 'true'
      ? prisma.stockAccount.groupBy({
          by: ['platform', 'type'],
          where: {
            deletedAt: null,
            archivedAt: null,
            status: 'AVAILABLE',
          },
          _count: { id: true },
        })
      : Promise.resolve([] as { platform: string; type: string; _count: { id: number } }[]),
    prisma.stockAccount.count({
      where: {
        status: 'DELIVERED',
        OR: [
          { deliveredAt: { gte: brtToday.from, lte: brtToday.to } },
          {
            deliveredAt: null,
            updatedAt: { gte: brtToday.from, lte: brtToday.to },
          },
        ],
      },
    }),
    prisma.stockAccount.groupBy({
      by: ['platform'],
      where: { deletedAt: null, archivedAt: null, status: 'AVAILABLE' },
      _count: { id: true },
    }),
  ])

  const sm = Object.fromEntries(settings.map((s) => [s.key, s.value]))
  const minPerSlice = parseInt(
    sm.estoque_minimo_per_faixa || sm.estoque_minimo || '10',
    10
  )
  const staleDaysThreshold = parseInt(sm.estoque_dias_alerta_validade || '90', 10)

  const lowStockAlerts = lowStockGroups
    .filter((g) => g._count.id < minPerSlice)
    .map((g) => ({
      platform: g.platform,
      type: g.type,
      count: g._count.id,
      min: minPerSlice,
    }))

  const accountIds = accounts.map((a) => a.id)
  const orderItems =
    accountIds.length === 0
      ? []
      : await prisma.orderItem.findMany({
          where: { accountId: { in: accountIds } },
          select: { accountId: true, orderId: true },
        })
  const saleOrderByAccount = new Map<string, string>()
  for (const oi of orderItems) {
    if (!saleOrderByAccount.has(oi.accountId)) saleOrderByAccount.set(oi.accountId, oi.orderId)
  }

  const accountsOut = accounts.map((a) => ({
    ...a,
    g2Status:
      a.productionG2?.status === 'APROVADA'
        ? 'APPROVED'
        : a.productionG2?.status === 'REPROVADA'
          ? 'REJECTED'
          : 'PENDING',
    firstWhiteCampaign: a.productionG2?.firstCampaignWhiteApproved ?? false,
    approvalDate: (a.productionG2?.approvedAt ?? a.productionG2?.sentToStockAt)?.toISOString() ?? null,
    saleOrderId: saleOrderByAccount.get(a.id) ?? null,
  }))

  const stockByPlatform = stockByPlatformRows.reduce(
    (acc, x) => ({ ...acc, [x.platform]: x._count.id }),
    {} as Record<string, number>
  )

  return NextResponse.json({
    accounts: accountsOut,
    criticalCount,
    byStatus: byStatusRows.reduce(
      (acc, x) => ({ ...acc, [x.status]: x._count.id }),
      {} as Record<string, number>
    ),
    lowStockAlerts,
    staleDaysThreshold,
    minAvailablePerSlice: minPerSlice,
    salesToday,
    stockByPlatform,
  })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = createSchema.parse(body)

    const account = await prisma.stockAccount.create({
      data: {
        platform: data.platform as 'GOOGLE_ADS' | 'META_ADS' | 'KWAI_ADS' | 'TIKTOK_ADS' | 'OTHER',
        type: data.type,
        source: 'MANUAL',
        yearStarted: data.yearStarted,
        niche: data.niche || null,
        minConsumed: data.minConsumed,
        purchasePrice: data.purchasePrice,
        salePrice: data.salePrice,
        markupPercent: data.markupPercent,
        description: data.description || null,
      },
    })

    return NextResponse.json(account)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao cadastrar conta' }, { status: 500 })
  }
}
