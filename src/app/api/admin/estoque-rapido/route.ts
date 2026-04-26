/**
 * POST /api/admin/estoque-rapido
 *
 * Adiciona N unidades de estoque diretamente da tela de Venda Rápida.
 * Cria registros no modelo Asset com status AVAILABLE.
 *
 * Acesso: ADMIN, CEO, COMMERCIAL
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const schema = z.object({
  /** Categoria do ativo (GOOGLE_ADS, META_ADS, etc.) */
  category:      z.string().min(2).max(50),
  /** Nome/descrição exibível do produto */
  displayName:   z.string().min(2).max(200),
  /** Código interno (ex: AA-CONT-000001) — opcional, gerado se omitido */
  productCode:   z.string().max(40).optional(),
  /** Preço de venda unitário */
  salePrice:     z.number().positive(),
  /** Quantidade a adicionar (1–500) */
  qty:           z.number().int().min(1).max(500),
  /** Notas técnicas internas */
  notes:         z.string().max(500).optional(),
})

// Mapa das categorias do listing (ProductListing.assetCategory) para AssetCategory do banco
// ProductListing usa strings livres; Asset usa enum AssetCategory
const LISTING_CATEGORY_TO_ASSET_CATEGORY: Record<string, string> = {
  GOOGLE_ADS:    'CONTAS',
  META_ADS:      'CONTAS',
  TIKTOK_ADS:    'CONTAS',
  AMAZON_ADS:    'CONTAS',
  LINKEDIN_ADS:  'CONTAS',
  PINTEREST_ADS: 'CONTAS',
  SNAPCHAT_ADS:  'CONTAS',
  // Categorias do enum Asset (passadas diretamente)
  CONTAS:        'CONTAS',
  PERFIS:        'PERFIS',
  BM:            'BM',
  PROXIES:       'PROXIES',
  SOFTWARE:      'SOFTWARE',
  INFRA:         'INFRA',
  HARDWARE:      'HARDWARE',
  OTHER:         'OUTROS',
  OUTROS:        'OUTROS',
}

// Mapa categoria → nome do vendor interno
const CATEGORY_TO_VENDOR_NAME: Record<string, string> = {
  CONTAS:   'Contas Internas',
  PERFIS:   'Perfis Internos',
  BM:       'Business Managers',
  PROXIES:  'Proxies',
  SOFTWARE: 'Software',
  INFRA:    'Infraestrutura',
  HARDWARE: 'Hardware',
  OUTROS:   'Genérico',
}

async function getOrCreateInternalVendor(assetCategory: string) {
  const vendorName = CATEGORY_TO_VENDOR_NAME[assetCategory] ?? 'Interno'
  const vendorCategory = assetCategory  // category no Vendor = CONTAS, PERFIS etc.

  const existing = await prisma.vendor.findFirst({
    where: { name: vendorName },
    select: { id: true },
  })
  if (existing) return existing.id

  const created = await prisma.vendor.create({
    data: {
      name:      vendorName,
      category:  vendorCategory,
      suspended: false,
      active:    true,
      rating:    10,
    },
    select: { id: true },
  })
  return created.id
}

function buildAdsId(assetCategory: string, rawCategory: string, seq: number) {
  // Usa a categoria original do listing para um código mais legível (ex: GOOG, META, PERF)
  const label = rawCategory !== assetCategory
    ? rawCategory.replace('_ADS', '').slice(0, 4)
    : assetCategory.slice(0, 4)
  return `AA-${label.toUpperCase()}-${String(seq).padStart(6, '0')}`
}

export async function POST(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'CEO', 'COMMERCIAL'])
  if (!auth.ok) return auth.response

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos.', details: parsed.error.flatten() }, { status: 422 })
  }

  const { category: rawCategory, displayName, productCode, salePrice, qty, notes } = parsed.data

  // Converte categoria do listing para AssetCategory do banco
  const assetCategory = LISTING_CATEGORY_TO_ASSET_CATEGORY[rawCategory] ?? 'CONTAS'

  const vendorId = await getOrCreateInternalVendor(assetCategory)

  // Conta quantos já existem para sequenciar IDs
  const existingCount = await prisma.asset.count({
    where: { category: assetCategory as never },
  })

  const assets: Array<{ adsId: string; displayName: string }> = []

  for (let i = 0; i < qty; i++) {
    const seq    = existingCount + i + 1
    const adsId  = productCode && qty === 1 ? productCode : buildAdsId(assetCategory, rawCategory, seq)

    const created = await prisma.asset.create({
      data: {
        adsId,
        category:    assetCategory as never,
        displayName,
        status:      'AVAILABLE',
        vendorId,
        costPrice:   salePrice * 0.6,
        salePrice,
        specs: {
          productCode:  productCode ?? adsId,
          productName:  displayName,
          notes:        notes ?? null,
          addedVia:     'estoque-rapido',
          listingCategory: rawCategory,
          addedBy:      auth.session.user.name ?? auth.session.user.id,
        },
        tags: 'estoque-rapido',
        receivedAt: new Date(),
      },
      select: { adsId: true, displayName: true },
    })
    assets.push(created)
  }

  await prisma.auditLog.create({
    data: {
      action: 'ESTOQUE_RAPIDO_ADICIONADO',
      entity: 'Asset',
      entityId: assets[0]?.adsId ?? '',
      userId: auth.session.user.id,
      details: {
        listingCategory: rawCategory,
        assetCategory,
        displayName,
        qty,
        salePrice,
        ids: assets.map((a) => a.adsId),
        addedBy: auth.session.user.name ?? auth.session.user.id,
      },
    },
  }).catch(() => {})

  return NextResponse.json({
    ok:      true,
    qty:     assets.length,
    assets,
    message: `${assets.length} unidade(s) adicionada(s) ao estoque com sucesso.`,
  }, { status: 201 })
}
