/**
 * GET  /api/admin/pos-venda — Lista pedidos PAID com dados de pós-venda
 * POST /api/admin/pos-venda — Cria ou atualiza credencial de entrega
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── GET: listagem de pedidos PAID ────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'CEO', 'COMMERCIAL', 'DELIVERER'])
  if (!auth.ok) return auth.response

  const { searchParams } = req.nextUrl
  const search    = String(searchParams.get('q') ?? '').trim().toLowerCase()
  const statusFilter = String(searchParams.get('status') ?? '').trim().toUpperCase()
  const limitParam   = Number.parseInt(searchParams.get('limit') ?? '50', 10)
  const offsetParam  = Number.parseInt(searchParams.get('offset') ?? '0', 10)
  const limit  = Math.max(1, Math.min(200, Number.isFinite(limitParam) ? limitParam : 50))
  const offset = Math.max(0, Number.isFinite(offsetParam) ? offsetParam : 0)

  const where: Record<string, unknown> = { status: 'PAID' }
  if (search) {
    where.OR = [
      { buyerName:      { contains: search } },
      { buyerCpf:       { contains: search } },
      { buyerWhatsapp:  { contains: search } },
      { buyerEmail:     { contains: search } },
      { interTxid:      { contains: search } },
      { listing: { title: { contains: search } } },
    ]
  }

  const [rows, total] = await Promise.all([
    prisma.quickSaleCheckout.findMany({
      where,
      orderBy: { paidAt: 'desc' },
      skip:    offset,
      take:    limit,
      select: {
        id:            true,
        paidAt:        true,
        createdAt:     true,
        buyerName:     true,
        buyerCpf:      true,
        buyerWhatsapp: true,
        buyerEmail:    true,
        qty:           true,
        totalAmount:   true,
        interTxid:     true,
        warrantyEndsAt: true,
        deliveryFlowStatus: true,
        stockProductCodeSnapshot: true,
        stockProductNameSnapshot: true,
        listing: {
          select: { id: true, title: true, slug: true, assetCategory: true },
        },
        seller: { select: { id: true, name: true } },
        credentials: {
          select: {
            id:           true,
            assetStatus:  true,
            assetOrigin:  true,
            executorName: true,
            supplierName: true,
            loginEmail:   true,
            replacedAt:   true,
            replacementReason: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),
    prisma.quickSaleCheckout.count({ where }),
  ])

  const items = rows
    .filter((r) => {
      if (!statusFilter) return true
      const credStatuses = r.credentials.map((c) => c.assetStatus)
      if (statusFilter === 'NO_CREDENTIAL') return credStatuses.length === 0
      return credStatuses.includes(statusFilter as never)
    })
    .map((r) => {
      const now = new Date()
      const inWarranty = r.warrantyEndsAt ? r.warrantyEndsAt > now : false
      const warrantyExpired = r.warrantyEndsAt ? r.warrantyEndsAt <= now && Boolean(r.paidAt) : false
      return {
        ...r,
        totalAmount: Number(r.totalAmount),
        inWarranty,
        warrantyExpired,
        hasCredentials: r.credentials.length > 0,
      }
    })

  return NextResponse.json({ items, total, limit, offset })
}

// ─── POST: criar credencial para um checkout ──────────────────────────────────

const createSchema = z.object({
  checkoutId:      z.string().min(1),
  assetId:         z.string().optional(),
  loginEmail:      z.string().optional(),
  loginPassword:   z.string().optional(),
  recoveryEmail:   z.string().optional(),
  twoFaSeed:       z.string().optional(),
  extraData:       z.record(z.unknown()).optional(),
  assetOrigin:     z.enum(['INTERNAL', 'EXTERNAL']).default('INTERNAL'),
  executorName:    z.string().max(100).optional(),
  executorId:      z.string().optional(),
  supplierName:    z.string().max(100).optional(),
  assetStatus:     z.enum(['DELIVERED', 'WARMING', 'SUSPENDED', 'REPLACED', 'RETURNED']).default('DELIVERED'),
  supportNote:     z.string().max(2000).optional(),
})

export async function POST(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'CEO', 'DELIVERER'])
  if (!auth.ok) return auth.response

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos.', details: parsed.error.flatten() }, { status: 422 })
  }

  const data = parsed.data

  const checkout = await prisma.quickSaleCheckout.findUnique({
    where: { id: data.checkoutId },
    select: { id: true, status: true },
  }).catch(() => null)

  if (!checkout) {
    return NextResponse.json({ error: 'Checkout não encontrado.' }, { status: 404 })
  }
  if (checkout.status !== 'PAID') {
    return NextResponse.json({ error: 'Só é possível registrar credenciais em pedidos PAID.' }, { status: 409 })
  }

  const credential = await prisma.quickSaleCredential.create({
    data: {
      checkoutId:    data.checkoutId,
      assetId:       data.assetId       ?? null,
      loginEmail:    data.loginEmail    ?? null,
      loginPassword: data.loginPassword ?? null,
      recoveryEmail: data.recoveryEmail ?? null,
      twoFaSeed:     data.twoFaSeed     ?? null,
      extraData:     data.extraData     ?? null,
      assetOrigin:   data.assetOrigin,
      executorName:  data.executorName  ?? null,
      executorId:    data.executorId    ?? null,
      supplierName:  data.supplierName  ?? null,
      assetStatus:   data.assetStatus,
      supportNote:   data.supportNote   ?? null,
    },
  })

  await prisma.quickSaleCredentialLog.create({
    data: {
      credentialId: credential.id,
      actorId:      auth.session.user.id,
      actorName:    auth.session.user.name ?? null,
      action:       'CREATED',
      details: {
        loginEmail:   data.loginEmail ?? null,
        assetOrigin:  data.assetOrigin,
        executorName: data.executorName ?? null,
        supplierName: data.supplierName ?? null,
        assetStatus:  data.assetStatus,
      },
    },
  }).catch((e) => console.error('[PosVenda] Falha ao criar log:', e))

  return NextResponse.json({ ok: true, credentialId: credential.id }, { status: 201 })
}
