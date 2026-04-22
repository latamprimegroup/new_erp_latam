/**
 * GET  /api/rma — Lista tickets com filtros
 * POST /api/rma — Abre novo ticket de RMA
 *
 * Roles com acesso: ADMIN, PURCHASING, COMMERCIAL, FINANCE, DELIVERER
 * Abertura de ticket: qualquer role acima
 * Aprovação: ADMIN, PURCHASING
 */
import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z }                from 'zod'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'
import type { RMAStatus, RMAReason } from '@prisma/client'

const ALLOWED = ['ADMIN', 'PURCHASING', 'COMMERCIAL', 'FINANCE', 'DELIVERER']

// Garantia padrão por categoria (dias)
const WARRANTY_DAYS: Record<string, number> = {
  GOOGLE_ADS: 7, META_ADS: 7, TIKTOK_ADS: 5,
  TWITTER_ADS: 5, AMAZON_ADS: 7, OTHER: 3,
}

const createSchema = z.object({
  originalAssetId: z.string(),
  reason:          z.enum(['CHECKPOINT', 'BAN', 'WRONG_PASSWORD', 'ACCOUNT_SUSPENDED', 'QUALITY_ISSUE', 'METRICS_ISSUE', 'OTHER']),
  reasonDetail:    z.string().max(1000).optional(),
  originalOrderId: z.string().optional(),
  extendedWarranty: z.boolean().default(false),
})

// Gerador de número sequencial de ticket
async function generateTicketNumber(): Promise<string> {
  const year  = new Date().getFullYear()
  const count = await prisma.rMATicket.count({ where: { ticketNumber: { startsWith: `RMA-${year}` } } })
  return `RMA-${year}-${String(count + 1).padStart(4, '0')}`
}

export async function GET(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status   = searchParams.get('status') as RMAStatus | null
  const vendorId = searchParams.get('vendorId')
  const page     = parseInt(searchParams.get('page') ?? '1', 10)
  const limit    = 20

  const where: Record<string, unknown> = {}
  if (status)   where.status   = status
  if (vendorId) where.vendorId = vendorId

  const [tickets, total] = await Promise.all([
    prisma.rMATicket.findMany({
      where,
      orderBy: { openedAt: 'desc' },
      take:    limit,
      skip:    (page - 1) * limit,
      include: {
        originalAsset:    { select: { adsId: true, displayName: true, category: true } },
        replacementAsset: { select: { adsId: true, displayName: true } },
        vendor:           { select: { id: true, name: true, rating: true, suspended: true } },
        openedBy:         { select: { name: true } },
        approvedBy:       { select: { name: true } },
      },
    }),
    prisma.rMATicket.count({ where }),
  ])

  return NextResponse.json({ tickets, total, page, pages: Math.ceil(total / limit) })
}

export async function POST(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const { originalAssetId, reason, reasonDetail, originalOrderId, extendedWarranty } = parsed.data

  // Busca o ativo original com dados completos
  const asset = await prisma.asset.findUnique({
    where:   { id: originalAssetId },
    include: { vendor: true, salesOrders: { where: { status: 'DELIVERED' }, orderBy: { deliveredAt: 'desc' }, take: 1 } },
  })
  if (!asset) return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 })

  // Calcula se está dentro da garantia
  const deliveredOrder = asset.salesOrders[0]
  const deliveredAt    = deliveredOrder?.deliveredAt ?? asset.deliveredAt
  const warrantyDays   = extendedWarranty ? 30 : (WARRANTY_DAYS[asset.category] ?? 7)
  const hoursAfterDelivery = deliveredAt
    ? Math.round((Date.now() - deliveredAt.getTime()) / 3600_000)
    : null
  const withinWarranty = hoursAfterDelivery !== null
    ? hoursAfterDelivery <= warrantyDays * 24
    : true // Se não há data de entrega, assume dentro da garantia

  // Verifica se já há RMA aberto para este ativo
  const existing = await prisma.rMATicket.findFirst({
    where: { originalAssetId, status: { notIn: ['CLOSED', 'REJECTED', 'CREDITED'] } },
  })
  if (existing) return NextResponse.json({ error: 'Já existe um ticket de RMA aberto para este ativo', ticketNumber: existing.ticketNumber }, { status: 409 })

  const ticketNumber = await generateTicketNumber()

  // Culpa do fornecedor: sim para todos exceto BAN (que pode ser uso indevido do cliente)
  const isVendorFault = reason !== 'BAN'

  const ticket = await prisma.rMATicket.create({
    data: {
      ticketNumber,
      originalAssetId,
      originalOrderId: originalOrderId ?? deliveredOrder?.id,
      vendorId: asset.vendorId,
      reason:   reason as RMAReason,
      reasonDetail,
      withinWarranty,
      warrantyDays,
      hoursAfterDelivery,
      isVendorFault,
      extendedWarranty,
      openedById: session.user.id,
      // Se fora da garantia → vai para revisão manual; dentro → aprovação direta
      status: withinWarranty ? 'OPEN' : 'UNDER_REVIEW',
    },
    include: {
      originalAsset: { select: { adsId: true, displayName: true } },
      vendor:        { select: { name: true } },
    },
  })

  // Registra na memória da ALFREDO IA para rastreamento
  await prisma.alfredoMemory.create({
    data: {
      type:    'INSIGHT',
      title:   `RMA Aberto: ${ticketNumber}`,
      content: `Ativo ${asset.adsId} (${asset.displayName}) — Motivo: ${reason}. Fornecedor: ${asset.vendor.name}. Dentro da garantia: ${withinWarranty ? 'SIM' : 'NÃO'}.`,
      metadata: { ticketId: ticket.id, vendorId: asset.vendorId, reason },
      userId:  session.user.id,
    },
  }).catch(() => null)

  return NextResponse.json(ticket, { status: 201 })
}
