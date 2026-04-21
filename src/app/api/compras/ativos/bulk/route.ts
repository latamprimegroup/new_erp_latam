/**
 * POST /api/compras/ativos/bulk
 * Bulk Upsert de ativos via JSON (parsear CSV no frontend antes de enviar).
 * Gera IDs Ads Ativos automaticamente para cada ativo sem adsId.
 * Processa em lotes de 50 para evitar timeout.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { COMPRAS_WRITE_ROLES } from '@/lib/asset-privacy'
import { generateAdsId } from '@/lib/asset-id-generator'
import type { AssetCategory, Prisma } from '@prisma/client'

const rowSchema = z.object({
  category:    z.enum(['CONTAS','PERFIS','BM','PROXIES','SOFTWARE','INFRA','HARDWARE','OUTROS']),
  subCategory: z.string().max(100).optional(),
  vendorId:    z.string().min(1),
  costPrice:   z.number().positive(),
  salePrice:   z.number().positive(),
  displayName: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  tags:        z.string().max(500).optional(),
  vendorRef:   z.string().max(100).optional(),
  rawData:     z.record(z.unknown()).optional(),
  specs:       z.record(z.unknown()).optional(),
  purchaseOrderId: z.string().optional(),
})

const bulkSchema = z.object({
  rows: z.array(rowSchema).min(1).max(2000),
})

const BATCH = 50

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !COMPRAS_WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = bulkSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const { rows } = parsed.data

  // Valida fornecedores referenciados
  const vendorIds = [...new Set(rows.map((r) => r.vendorId))]
  const vendors = await prisma.vendor.findMany({ where: { id: { in: vendorIds }, active: true }, select: { id: true } })
  const validVendors = new Set(vendors.map((v) => v.id))
  const invalidRows  = rows.filter((r) => !validVendors.has(r.vendorId))
  if (invalidRows.length > 0) {
    return NextResponse.json({
      error: `Fornecedores inválidos ou inativos: ${[...new Set(invalidRows.map((r) => r.vendorId))].join(', ')}`,
    }, { status: 422 })
  }

  let created = 0
  const errors: { row: number; error: string }[] = []

  // Processa em lotes
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    await Promise.all(
      batch.map(async (row, batchIdx) => {
        const rowIdx = i + batchIdx
        try {
          const adsId = await generateAdsId(row.category as AssetCategory)
          await prisma.asset.create({
            data: {
              adsId,
              category:        row.category,
              subCategory:     row.subCategory,
              vendorId:        row.vendorId,
              costPrice:       row.costPrice,
              salePrice:       row.salePrice,
              displayName:     row.displayName,
              description:     row.description,
              tags:            row.tags,
              vendorRef:       row.vendorRef,
              rawData:         row.rawData ? (row.rawData as Prisma.InputJsonValue) : undefined,
              specs:           row.specs   ? (row.specs   as Prisma.InputJsonValue) : undefined,
              purchaseOrderId: row.purchaseOrderId,
              status:          'AVAILABLE',
            },
          })
          await prisma.assetMovement.create({
            data: {
              assetId:  (await prisma.asset.findUnique({ where: { adsId }, select: { id: true } }))!.id,
              toStatus: 'AVAILABLE',
              reason:   'Entrada em lote (bulk import)',
              userId:   session.user.id,
            },
          })
          created++
        } catch (err) {
          errors.push({ row: rowIdx + 1, error: (err as Error).message })
        }
      }),
    )
  }

  return NextResponse.json({
    created,
    failed:  errors.length,
    total:   rows.length,
    errors:  errors.slice(0, 20),
  }, { status: created > 0 ? 201 : 422 })
}
