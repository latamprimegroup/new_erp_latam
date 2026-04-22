/**
 * GET  /api/compras/ativos — Lista ativos com filtros (privacidade por role)
 * POST /api/compras/ativos — Cria ativo (PURCHASING/ADMIN), gera ID AA-XXXX
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { maskAssets, canSeeSensitiveData, COMPRAS_READ_ROLES, COMPRAS_WRITE_ROLES } from '@/lib/asset-privacy'
import { generateAdsId } from '@/lib/asset-id-generator'
import type { AssetCategory, AssetStatus, Prisma } from '@prisma/client'

const createSchema = z.object({
  category:       z.enum(['CONTAS','PERFIS','BM','PROXIES','SOFTWARE','INFRA','HARDWARE','OUTROS']),
  subCategory:    z.string().max(100).optional(),
  vendorId:       z.string().min(1),
  costPrice:      z.number().positive(),
  vendorRef:      z.string().max(100).optional(),
  rawData:        z.record(z.unknown()).optional(),
  salePrice:      z.number().positive(),
  displayName:    z.string().min(2).max(200),
  description:    z.string().max(5000).optional(),
  specs:          z.record(z.unknown()).optional(),
  tags:           z.string().max(500).optional(),
  purchaseOrderId: z.string().optional(),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !COMPRAS_READ_ROLES.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const q         = searchParams.get('q')
  const category  = searchParams.get('category') as AssetCategory | null
  const status    = searchParams.get('status') as AssetStatus | null
  const vendorId  = searchParams.get('vendorId')
  const page      = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit     = Math.min(100, parseInt(searchParams.get('limit') ?? '25', 10))
  const hasSensitive = canSeeSensitiveData(session.user.role)

  const where: Record<string, unknown> = {}
  if (category) where.category = category
  if (status)   where.status   = status
  if (vendorId && hasSensitive) where.vendorId = vendorId
  if (q) {
    where.OR = [
      { adsId:       { contains: q } },
      { displayName: { contains: q } },
      { tags:        { contains: q } },
    ]
  }

  const include = hasSensitive
    ? { vendor: { select: { id: true, name: true, category: true, rating: true } }, _count: { select: { movements: true } } }
    : { _count: { select: { movements: true } } }

  const [assets, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
      include,
    }),
    prisma.asset.count({ where }),
  ])

  // Contagens por status para o dashboard
  const byStatus = await prisma.asset.groupBy({
    by:      ['status'],
    _count:  true,
    where:   hasSensitive ? {} : { status: { in: ['AVAILABLE', 'QUARANTINE', 'TRIAGEM', 'DELIVERED'] } },
  })

  const masked = maskAssets(
    assets as unknown as Record<string, unknown>[],
    session.user.role,
  )

  // Resumo financeiro — apenas para quem tem dados sensíveis
  let summary: Record<string, number> | null = null
  if (hasSensitive) {
    const [avail, sold] = await Promise.all([
      prisma.asset.aggregate({
        _sum:   { costPrice: true, salePrice: true },
        _count: { id: true },
        where:  { status: 'AVAILABLE' },
      }),
      prisma.asset.aggregate({
        _sum:   { costPrice: true, salePrice: true },
        _count: { id: true },
        where:  { status: 'SOLD' },
      }),
    ])
    const availCost = Number(avail._sum.costPrice ?? 0)
    const availSale = Number(avail._sum.salePrice ?? 0)
    summary = {
      availableCount:      avail._count.id,
      availableCostTotal:  availCost,
      availableSaleTotal:  availSale,
      availableMargin:     availSale - availCost,
      availableMarginPct:  availSale > 0 ? Math.round(((availSale - availCost) / availSale) * 100) : 0,
      soldCount:           sold._count.id,
      soldRevenue:         Number(sold._sum.salePrice ?? 0),
    }
  }

  return NextResponse.json({
    assets: masked,
    total,
    page,
    pages:    Math.ceil(total / limit),
    byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count])),
    summary,
  })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !COMPRAS_WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const { category, vendorId, costPrice, salePrice, vendorRef, rawData, displayName, description, specs, tags, subCategory, purchaseOrderId } = parsed.data

  // Verifica se fornecedor existe
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } })
  if (!vendor) return NextResponse.json({ error: 'Fornecedor não encontrado' }, { status: 404 })

  const adsId = await generateAdsId(category)

  const asset = await prisma.asset.create({
    data: {
      adsId,
      category,
      subCategory,
      vendorId,
      costPrice,
      vendorRef,
      rawData: rawData ? (rawData as Prisma.InputJsonValue) : undefined,
      salePrice,
      displayName,
      description,
      specs: specs ? (specs as Prisma.InputJsonValue) : undefined,
      tags,
      purchaseOrderId,
      status: 'AVAILABLE',
    },
    include: {
      vendor: { select: { name: true, category: true } },
    },
  })

  // Registra primeiro movimento
  await prisma.assetMovement.create({
    data: {
      assetId:  asset.id,
      toStatus: 'AVAILABLE',
      reason:   'Entrada no estoque',
      userId:   session.user.id,
    },
  })

  return NextResponse.json(asset, { status: 201 })
}
