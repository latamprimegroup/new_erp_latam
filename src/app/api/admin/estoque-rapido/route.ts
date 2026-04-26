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

// Mapa categoria → ID do vendor padrão "interno"
const CATEGORY_TO_VENDOR_NAME: Record<string, string> = {
  GOOGLE_ADS:    'Google Ads',
  META_ADS:      'Meta Ads',
  TIKTOK_ADS:    'TikTok Ads',
  AMAZON_ADS:    'Amazon Ads',
  LINKEDIN_ADS:  'LinkedIn Ads',
  PINTEREST_ADS: 'Pinterest Ads',
  SNAPCHAT_ADS:  'Snapchat Ads',
  OTHER:         'Genérico',
}

async function getOrCreateInternalVendor(category: string) {
  const vendorName = CATEGORY_TO_VENDOR_NAME[category] ?? 'Interno'
  const existing = await prisma.vendor.findFirst({
    where: { name: vendorName },
    select: { id: true },
  })
  if (existing) return existing.id

  const created = await prisma.vendor.create({
    data: {
      name:       vendorName,
      origin:     'INTERNAL',
      suspended:  false,
    },
    select: { id: true },
  })
  return created.id
}

function buildAdsId(category: string, seq: number) {
  const catCode = category.replace('_ADS', '').slice(0, 4).toUpperCase()
  return `AA-${catCode}-${String(seq).padStart(6, '0')}`
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

  const { category, displayName, productCode, salePrice, qty, notes } = parsed.data

  const vendorId = await getOrCreateInternalVendor(category)

  // Conta quantos já existem para sequenciar IDs
  const existingCount = await prisma.asset.count({
    where: { category: category as never },
  })

  const assets: Array<{ adsId: string; displayName: string }> = []

  for (let i = 0; i < qty; i++) {
    const seq    = existingCount + i + 1
    const adsId  = productCode && qty === 1 ? productCode : buildAdsId(category, seq)

    const created = await prisma.asset.create({
      data: {
        adsId,
        category:    category as never,
        displayName,
        status:      'AVAILABLE',
        vendorId,
        costPrice:   salePrice * 0.6,  // custo estimado 60% do preço de venda
        salePrice,
        specs: {
          productCode:  productCode ?? adsId,
          productName:  displayName,
          notes:        notes ?? null,
          addedVia:     'estoque-rapido',
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
        category,
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
