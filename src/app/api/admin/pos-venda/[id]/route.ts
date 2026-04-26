/**
 * GET   /api/admin/pos-venda/[id] — Detalhes completos de um pedido + credenciais + logs
 * PATCH /api/admin/pos-venda/[id] — Atualiza credencial (status, senha, nota, substituição)
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRoles(['ADMIN', 'CEO', 'COMMERCIAL', 'DELIVERER'])
  if (!auth.ok) return auth.response

  const checkout = await prisma.quickSaleCheckout.findUnique({
    where: { id: params.id },
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
      interE2eId:    true,
      warrantyEndsAt: true,
      deliveryFlowStatus: true,
      deliveryStatusNote: true,
      stockProductCodeSnapshot: true,
      stockProductNameSnapshot: true,
      utmSource:     true,
      utmMedium:     true,
      utmCampaign:   true,
      reservedAssetIds: true,
      listing: {
        select: {
          id:            true,
          title:         true,
          slug:          true,
          assetCategory: true,
          warrantyDays:  true,
        },
      },
      seller: { select: { id: true, name: true, email: true } },
      manager: { select: { id: true, name: true } },
      credentials: {
        orderBy: { createdAt: 'asc' },
        select: {
          id:              true,
          assetId:         true,
          loginEmail:      true,
          loginPassword:   true,
          recoveryEmail:   true,
          twoFaSeed:       true,
          extraData:       true,
          assetOrigin:     true,
          executorName:    true,
          executorId:      true,
          supplierName:    true,
          assetStatus:     true,
          supportNote:     true,
          replacedAt:      true,
          replacedById:    true,
          replacementReason: true,
          replacementNote:   true,
          createdAt:       true,
          updatedAt:       true,
          executor: { select: { id: true, name: true } },
          logs: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
              id:        true,
              action:    true,
              actorName: true,
              details:   true,
              createdAt: true,
            },
          },
        },
      },
    },
  })

  if (!checkout) {
    return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  }

  const now = new Date()
  return NextResponse.json({
    ...checkout,
    totalAmount: Number(checkout.totalAmount),
    inWarranty:      checkout.warrantyEndsAt ? checkout.warrantyEndsAt > now : false,
    warrantyExpired: checkout.warrantyEndsAt ? checkout.warrantyEndsAt <= now && Boolean(checkout.paidAt) : false,
  })
}

// ─── PATCH: atualizar credencial ──────────────────────────────────────────────

const patchSchema = z.object({
  credentialId:    z.string().min(1),
  action:          z.enum(['UPDATE_STATUS', 'UPDATE_PASSWORD', 'UPDATE_NOTE', 'REPLACE', 'UPDATE_EXTRA']),
  // UPDATE_STATUS
  assetStatus:     z.enum(['DELIVERED', 'WARMING', 'SUSPENDED', 'REPLACED', 'RETURNED']).optional(),
  // UPDATE_PASSWORD
  loginPassword:   z.string().max(500).optional(),
  loginEmail:      z.string().max(300).optional(),
  recoveryEmail:   z.string().max(300).optional(),
  twoFaSeed:       z.string().max(500).optional(),
  // UPDATE_NOTE
  supportNote:     z.string().max(2000).optional(),
  // UPDATE_EXTRA
  extraData:       z.record(z.unknown()).optional(),
  // REPLACE
  replacementReason: z.enum(['PROFILE_ERROR', 'DIRTY_PROXY', 'CREATIVE_ISSUE', 'PLATFORM_BAN', 'CLIENT_REQUEST', 'OTHER']).optional(),
  replacementNote:   z.string().max(500).optional(),
  // Nova credencial de substituição (para REPLACE)
  newCredential: z.object({
    loginEmail:    z.string().optional(),
    loginPassword: z.string().optional(),
    recoveryEmail: z.string().optional(),
    twoFaSeed:     z.string().optional(),
    extraData:     z.record(z.unknown()).optional(),
    assetOrigin:   z.enum(['INTERNAL', 'EXTERNAL']).default('INTERNAL'),
    executorName:  z.string().max(100).optional(),
    executorId:    z.string().optional(),
    supplierName:  z.string().max(100).optional(),
  }).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRoles(['ADMIN', 'CEO', 'DELIVERER'])
  if (!auth.ok) return auth.response

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos.', details: parsed.error.flatten() }, { status: 422 })
  }

  const data = parsed.data

  const credential = await prisma.quickSaleCredential.findUnique({
    where: { id: data.credentialId },
    select: { id: true, checkoutId: true, assetStatus: true },
  })
  if (!credential || credential.checkoutId !== params.id) {
    return NextResponse.json({ error: 'Credencial não encontrada neste pedido.' }, { status: 404 })
  }

  const actorId   = auth.session.user.id
  const actorName = auth.session.user.name ?? null

  if (data.action === 'UPDATE_STATUS') {
    if (!data.assetStatus) {
      return NextResponse.json({ error: 'assetStatus é obrigatório para UPDATE_STATUS.' }, { status: 422 })
    }
    await prisma.quickSaleCredential.update({
      where: { id: credential.id },
      data: { assetStatus: data.assetStatus },
    })
    await prisma.quickSaleCredentialLog.create({
      data: {
        credentialId: credential.id,
        actorId, actorName,
        action: 'STATUS_CHANGED',
        details: { from: credential.assetStatus, to: data.assetStatus },
      },
    })
  }

  if (data.action === 'UPDATE_PASSWORD') {
    await prisma.quickSaleCredential.update({
      where: { id: credential.id },
      data: {
        loginEmail:    data.loginEmail    ?? undefined,
        loginPassword: data.loginPassword ?? undefined,
        recoveryEmail: data.recoveryEmail ?? undefined,
        twoFaSeed:     data.twoFaSeed     ?? undefined,
      },
    })
    await prisma.quickSaleCredentialLog.create({
      data: {
        credentialId: credential.id,
        actorId, actorName,
        action: 'PASSWORD_CHANGED',
        details: { fieldsUpdated: Object.keys(data).filter((k) => ['loginEmail', 'loginPassword', 'recoveryEmail', 'twoFaSeed'].includes(k) && data[k as keyof typeof data]) },
      },
    })
  }

  if (data.action === 'UPDATE_NOTE') {
    await prisma.quickSaleCredential.update({
      where: { id: credential.id },
      data: { supportNote: data.supportNote ?? null },
    })
    await prisma.quickSaleCredentialLog.create({
      data: {
        credentialId: credential.id,
        actorId, actorName,
        action: 'NOTE_UPDATED',
        details: { note: data.supportNote ?? null },
      },
    })
  }

  if (data.action === 'UPDATE_EXTRA') {
    await prisma.quickSaleCredential.update({
      where: { id: credential.id },
      data: { extraData: data.extraData ?? null },
    })
    await prisma.quickSaleCredentialLog.create({
      data: {
        credentialId: credential.id,
        actorId, actorName,
        action: 'EXTRA_UPDATED',
        details: {},
      },
    })
  }

  if (data.action === 'REPLACE') {
    if (!data.replacementReason) {
      return NextResponse.json({ error: 'replacementReason é obrigatório para REPLACE.' }, { status: 422 })
    }

    const now = new Date()

    // 1. Marca a credencial antiga como substituída
    await prisma.quickSaleCredential.update({
      where: { id: credential.id },
      data: {
        assetStatus:       'REPLACED',
        replacementReason: data.replacementReason,
        replacementNote:   data.replacementNote ?? null,
        replacedAt:        now,
      },
    })

    // 2. Cria nova credencial de substituição
    const nc = data.newCredential
    const newCred = await prisma.quickSaleCredential.create({
      data: {
        checkoutId:    credential.checkoutId,
        loginEmail:    nc?.loginEmail    ?? null,
        loginPassword: nc?.loginPassword ?? null,
        recoveryEmail: nc?.recoveryEmail ?? null,
        twoFaSeed:     nc?.twoFaSeed     ?? null,
        extraData:     nc?.extraData     ?? null,
        assetOrigin:   nc?.assetOrigin   ?? 'INTERNAL',
        executorName:  nc?.executorName  ?? null,
        executorId:    nc?.executorId    ?? null,
        supplierName:  nc?.supplierName  ?? null,
        assetStatus:   'DELIVERED',
      },
    })

    // 3. Vincula substituição
    await prisma.quickSaleCredential.update({
      where: { id: credential.id },
      data: { replacedById: newCred.id },
    })

    await prisma.quickSaleCredentialLog.create({
      data: {
        credentialId: credential.id,
        actorId, actorName,
        action: 'REPLACED',
        details: {
          reason:           data.replacementReason,
          note:             data.replacementNote ?? null,
          newCredentialId:  newCred.id,
        },
      },
    })
    await prisma.quickSaleCredentialLog.create({
      data: {
        credentialId: newCred.id,
        actorId, actorName,
        action: 'CREATED',
        details: { replacedFrom: credential.id },
      },
    })
  }

  return NextResponse.json({ ok: true })
}
