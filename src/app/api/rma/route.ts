/**
 * GET  /api/rma — Lista tickets com filtros
 * POST /api/rma — Abre novo ticket de RMA
 *
 * Roles com acesso: ADMIN, PURCHASING, COMMERCIAL, FINANCE, DELIVERER, PRODUCER, PRODUCTION_MANAGER
 * Abertura de ticket: qualquer role acima
 * Aprovação: ADMIN, PURCHASING
 * PRODUCER/PRODUCTION_MANAGER: só vêem seus próprios tickets (filtro por openedById)
 */
import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z }                from 'zod'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'
import type { RMAStatus, RMAReason } from '@prisma/client'

const ALLOWED = ['ADMIN', 'PURCHASING', 'COMMERCIAL', 'FINANCE', 'DELIVERER', 'PRODUCER', 'PRODUCTION_MANAGER']
const PRODUCER_ROLES = ['PRODUCER', 'PRODUCTION_MANAGER']

// Garantia padrão por categoria (dias)
const WARRANTY_DAYS: Record<string, number> = {
  GOOGLE_ADS: 7, META_ADS: 7, TIKTOK_ADS: 5,
  TWITTER_ADS: 5, AMAZON_ADS: 7, OTHER: 3,
}

const createSchema = z.object({
  // Modo simplificado (campos livres) — não requer lookup de ativo
  suspendedAccountRaw:   z.string().max(100).optional(),
  replacementAccountRaw: z.string().max(100).optional(),
  clientCodeRaw:         z.string().max(20).optional(),
  accountTypeRaw:        z.enum(['BR_MANUAL', 'BR_AUTO', 'USD_AUTO', 'EUR_AUTO']).optional(),
  // Campos herdados (modo legacy com asset lookup)
  originalAssetId:  z.string().optional(),
  reason:           z.enum(['CHECKPOINT', 'BAN', 'WRONG_PASSWORD', 'ACCOUNT_SUSPENDED', 'QUALITY_ISSUE', 'METRICS_ISSUE', 'OTHER']).default('ACCOUNT_SUSPENDED'),
  reasonDetail:     z.string().max(1000).optional(),
  originalOrderId:  z.string().optional(),
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

  // Produtores só vêem os tickets que eles mesmos abriram
  if (PRODUCER_ROLES.includes(session.user.role)) {
    where.openedById = session.user.id
  }

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

  const {
    suspendedAccountRaw, replacementAccountRaw, clientCodeRaw, accountTypeRaw,
    originalAssetId, reason, reasonDetail, originalOrderId, extendedWarranty,
  } = parsed.data

  // ── Tenta encontrar o ativo no banco pelo ID informado (opcional) ──────────
  let asset = null
  let resolvedAssetId = originalAssetId ?? null
  let resolvedVendorId: string | null = null

  const searchId = suspendedAccountRaw ?? originalAssetId
  if (searchId) {
    asset = await prisma.asset.findFirst({
      where: {
        OR: [
          { id: searchId },
          { adsId: { contains: searchId } },
        ],
      },
      include: { vendor: true },
    })
    if (asset) {
      resolvedAssetId = asset.id
      resolvedVendorId = asset.vendorId
    }
  }

  // Garantia e timing
  const deliveredAt        = asset?.deliveredAt ?? null
  const warrantyDays       = extendedWarranty ? 30 : (asset ? (WARRANTY_DAYS[asset.category] ?? 7) : 7)
  const hoursAfterDelivery = deliveredAt
    ? Math.round((Date.now() - new Date(deliveredAt).getTime()) / 3600_000)
    : null
  const withinWarranty     = hoursAfterDelivery !== null
    ? hoursAfterDelivery <= warrantyDays * 24
    : true

  // Verifica duplicata apenas se tiver asset linkado
  if (resolvedAssetId) {
    const existing = await prisma.rMATicket.findFirst({
      where: { originalAssetId: resolvedAssetId, status: { notIn: ['CLOSED', 'REJECTED', 'CREDITED'] } },
    })
    if (existing) return NextResponse.json({ error: 'Já existe um ticket de RMA aberto para este ativo', ticketNumber: existing.ticketNumber }, { status: 409 })
  }

  const ticketNumber  = await generateTicketNumber()
  const isVendorFault = reason !== 'BAN'

  const ticket = await prisma.rMATicket.create({
    data: {
      ticketNumber,
      originalAssetId:       resolvedAssetId,
      originalOrderId:       originalOrderId ?? deliveredOrder?.id ?? null,
      vendorId:              resolvedVendorId,
      reason:                reason as RMAReason,
      reasonDetail,
      withinWarranty,
      warrantyDays,
      hoursAfterDelivery,
      isVendorFault,
      extendedWarranty,
      openedById:            session.user.id,
      status:                withinWarranty ? 'OPEN' : 'UNDER_REVIEW',
      // Campos manuais
      suspendedAccountRaw:   suspendedAccountRaw ?? null,
      replacementAccountRaw: replacementAccountRaw ?? null,
      clientCodeRaw:         clientCodeRaw ?? null,
      accountTypeRaw:        accountTypeRaw ?? null,
    },
    include: {
      originalAsset: { select: { adsId: true, displayName: true } },
      vendor:        { select: { name: true } },
    },
  })

  // Registra na ALFREDO IA
  const label = asset ? `${asset.adsId} (${asset.displayName})` : (suspendedAccountRaw ?? '—')
  await prisma.alfredoMemory.create({
    data: {
      type:    'INSIGHT',
      title:   `RMA Aberto: ${ticketNumber}`,
      content: `Conta: ${label} — Motivo: ${reason}. Cliente: ${clientCodeRaw ?? '—'}. Reposição: ${replacementAccountRaw ?? '—'}. Tipo: ${accountTypeRaw ?? '—'}.`,
      metadata: { ticketId: ticket.id, vendorId: resolvedVendorId, reason },
      userId:  session.user.id,
    },
  }).catch(() => null)

  return NextResponse.json(ticket, { status: 201 })
}
