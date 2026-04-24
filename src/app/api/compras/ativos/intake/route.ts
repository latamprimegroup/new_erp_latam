/**
 * POST /api/compras/ativos/intake
 * Endpoint duplo:
 *   action = "parse"   → Retorna preview dos ativos extraídos (sem salvar)
 *   action = "confirm" → Salva os ativos confirmados no banco
 *
 * Acesso: ADMIN, PURCHASING
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseAssetText, upsertVendor, platformToCategory, generateCatalog, type ParsedAssetRow, type Platform } from '@/lib/asset-parser'
import { generateAdsId } from '@/lib/asset-id-generator'

const ALLOWED = ['ADMIN', 'PURCHASING']

// ─── Schema de request ────────────────────────────────────────────────────────

const parseSchema = z.object({
  action:    z.literal('parse'),
  text:      z.string().min(10).max(50_000),
  platform:  z.enum(['GOOGLE','META','TIKTOK','TWITTER','GENERIC']).optional(),
  startSeq:  z.number().int().min(1).default(1),
})

const confirmRowSchema = z.object({
  adsId:          z.string(),
  displayName:    z.string().max(200),
  description:    z.string().max(2000).optional(),
  spendValue:     z.number().min(0),
  currency:       z.enum(['BRL','USD']),
  spendClass:     z.enum(['HS','MS','LS','DS']),
  platform:       z.enum(['GOOGLE','META','TIKTOK','TWITTER','GENERIC']),
  year:           z.number().int().min(2000).max(2099).nullable(),
  rawNiche:       z.string(),
  faturamento:    z.string().nullable().optional(),
  verificacao:    z.string().nullable().optional(),
  aquecimento:    z.string().nullable().optional(),
  pagamento:      z.string().nullable().optional(),
  realId:         z.string().nullable().optional(),
  tags:           z.string().optional(),
  suggestedPrice: z.number().min(0),
  /** Sobrescreve o ID gerado pelo parser (edição manual) */
  customAdsId:    z.string().optional(),
  /** Credenciais do ativo (rawData) — inseridas manualmente pelo comprador */
  credentials:    z.record(z.string()).optional(),
})

const confirmSchema = z.object({
  action:       z.literal('confirm'),
  vendorName:   z.string().min(2).max(200),
  vendorWhatsapp: z.string().optional(),
  vendorEmail:  z.string().email().optional(),
  costPerAsset: z.number().min(0),      // custo unitário pago ao fornecedor
  minMarginPct: z.number().min(0).max(99).default(20),
  markupPct:    z.number().min(0).max(999).default(50),
  purchaseNotes: z.string().max(1000).optional(),
  rows:         z.array(confirmRowSchema).min(1).max(500),
})

// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão — apenas Compras/Admin' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const discriminant = (body as { action?: string }).action

  // ── PARSE (preview sem salvar) ──────────────────────────────────────────────
  if (discriminant === 'parse') {
    const parsed = parseSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

    const { text, platform, startSeq } = parsed.data
    const rows = parseAssetText(text, platform as Platform | undefined, startSeq)

    if (rows.length === 0)
      return NextResponse.json({ error: 'Nenhum ativo extraído do texto. Verifique o formato.' }, { status: 422 })

    // Conta ativos existentes para sugerir startSeq correto
    const existingCount = await prisma.asset.count({ where: { adsId: { startsWith: 'AA-' } } })

    return NextResponse.json({
      rows,
      count:        rows.length,
      warnings:     rows.filter((r) => r.warnings.length > 0).length,
      nextStartSeq: existingCount + 1,
      catalog:      generateCatalog(rows as ParsedAssetRow[]),
    })
  }

  // ── CONFIRM (salva no banco) ────────────────────────────────────────────────
  if (discriminant === 'confirm') {
    const parsed = confirmSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

    const { vendorName, vendorWhatsapp, vendorEmail, costPerAsset, minMarginPct, markupPct, purchaseNotes, rows } = parsed.data

    // 1. Upsert do fornecedor
    const vendor = await upsertVendor(vendorName, { whatsapp: vendorWhatsapp, email: vendorEmail })

    // 2. Cria PurchaseOrder para o lote (flag "Aguardando Acerto com Fornecedor")
    const totalCost   = costPerAsset * rows.length
    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        vendorId:    vendor.id,
        totalAmount: totalCost,
        paidAmount:  0,
        status:      'PENDING',
        notes:       purchaseNotes ?? `Intake em lote — ${rows.length} ativos — ${new Date().toLocaleDateString('pt-BR')}`,
        createdBy:   session.user.id,
      },
    })

    // 3. Gera IDs únicos e insere ativos em paralelo (batch de 50)
    const created: string[] = []
    const errors:  string[] = []
    const BATCH   = 50

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      await Promise.all(batch.map(async (row) => {
        try {
          // Usa ID customizado (editado na UI) ou gera novo
          const category = platformToCategory(row.platform as Platform)
          const finalId  = row.customAdsId?.trim()
            ? row.customAdsId.trim()
            : await generateAdsId(category)

          const costPrice    = costPerAsset
          const floorValue   = costPrice * (1 + minMarginPct / 100)
          const salePrice    = row.suggestedPrice > 0 ? row.suggestedPrice : costPrice * (1 + markupPct / 100)

          const specs: Record<string, unknown> = {
            platform:    row.platform,
            year:        row.year,
            spendValue:  row.spendValue,
            currency:    row.currency,
            spendClass:  row.spendClass,
            faturamento: row.faturamento,
            verificacao: row.verificacao,
            aquecimento: row.aquecimento,
            pagamento:   row.pagamento,
            realId:      row.realId ?? undefined,
          }

          const asset = await prisma.asset.create({
            data: {
              adsId:           finalId,
              category,
              subCategory:     row.platform,
              status:          'TRIAGEM',  // Quarentena inicial: vai para Disponível após triagem
              vendorId:        vendor.id,
              costPrice,
              vendorRef:       `Intake ${new Date().toISOString().slice(0, 10)}`,
              rawData:         row.credentials ? (row.credentials as Prisma.InputJsonValue) : undefined,
              salePrice,
              floorPrice:      floorValue,
              minMarginPct,
              markupPct,
              displayName:     row.displayName,
              description:     row.description,
              tags:            row.tags,
              specs:           specs as Prisma.InputJsonValue,
              purchaseOrderId: purchaseOrder.id,
            },
          })

          await prisma.assetMovement.create({
            data: {
              assetId:    asset.id,
              toStatus:   'TRIAGEM',
              reason:     `Intake WhatsApp — fornecedor: ${vendorName}`,
              userId:     session.user.id,
            },
          })

          created.push(finalId)
        } catch (err) {
          errors.push(`[${row.adsId}] ${(err as Error).message}`)
        }
      }))
    }

    // Gera catálogo final apenas dos ativos criados com sucesso
    const successRows = rows.filter((r) => created.includes(r.customAdsId?.trim() ?? r.adsId))
    const catalog = generateCatalog(successRows as ParsedAssetRow[])

    return NextResponse.json({
      created:        created.length,
      errors:         errors.length,
      errorDetails:   errors,
      purchaseOrderId: purchaseOrder.id,
      vendorId:       vendor.id,
      catalog,
      message:        `${created.length} ativos em triagem. Financeiro deve confirmar pagamento ao fornecedor para liberar ao estoque.`,
    }, { status: 201 })
  }

  return NextResponse.json({ error: 'Ação inválida. Use "parse" ou "confirm".' }, { status: 400 })
}
