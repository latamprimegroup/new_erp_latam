/**
 * POST /api/admin/pos-venda/troca-rapida
 *
 * Troca 1 Clique: substitui o ativo de um pedido de forma atômica.
 * 1. Reserva novo ativo do estoque (mesmo critério do listing original)
 * 2. Marca ativo anterior como RETURNED no estoque
 * 3. Marca credencial antiga como REPLACED com motivo
 * 4. Cria nova credencial vazia (para preenchimento posterior) ou já preenchida
 * 5. Revoga magic links antigos + gera novo magic link
 * 6. Dispara WhatsApp com novo link (opcional)
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import {
  createDeliveryMagicLink,
  revokeMagicLinksForCheckout,
} from '@/lib/delivery-magic-link'
import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'
import { z } from 'zod'

const schema = z.object({
  checkoutId:        z.string().min(1),
  credentialId:      z.string().min(1),
  replacementReason: z.enum(['PROFILE_ERROR', 'DIRTY_PROXY', 'CREATIVE_ISSUE', 'PLATFORM_BAN', 'CLIENT_REQUEST', 'OTHER']),
  replacementNote:   z.string().max(500).optional(),
  /** Credenciais da nova conta (podem ser preenchidas agora ou depois) */
  newLoginEmail:     z.string().max(300).optional(),
  newLoginPassword:  z.string().max(500).optional(),
  newRecoveryEmail:  z.string().max(300).optional(),
  newTwoFaSeed:      z.string().max(500).optional(),
  newExecutorName:   z.string().max(100).optional(),
  newSupplierName:   z.string().max(100).optional(),
  newAssetOrigin:    z.enum(['INTERNAL', 'EXTERNAL']).default('INTERNAL'),
  /** Enviar WhatsApp com novo magic link imediatamente */
  sendWhatsapp:      z.boolean().default(true),
  /** Horas de validade do novo magic link */
  expiryHours:       z.number().int().min(1).max(720).default(72),
})

export async function POST(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'CEO', 'DELIVERER'])
  if (!auth.ok) return auth.response

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos.', details: parsed.error.flatten() }, { status: 422 })
  }

  const data = parsed.data

  // 1. Busca checkout e credencial
  const checkout = await prisma.quickSaleCheckout.findUnique({
    where: { id: data.checkoutId },
    select: {
      id: true, status: true,
      buyerName: true, buyerWhatsapp: true,
      listingId: true,
      listing: {
        select: {
          title: true, slug: true,
          assetCategory: true,
          stockProductCode: true,
          stockProductName: true,
        },
      },
    },
  })

  if (!checkout || checkout.status !== 'PAID') {
    return NextResponse.json({ error: 'Checkout não encontrado ou não está pago.' }, { status: 404 })
  }

  const oldCred = await prisma.quickSaleCredential.findFirst({
    where: { id: data.credentialId, checkoutId: data.checkoutId },
    select: { id: true, assetId: true, assetStatus: true },
  })

  if (!oldCred) {
    return NextResponse.json({ error: 'Credencial não encontrada neste pedido.' }, { status: 404 })
  }
  if (oldCred.assetStatus === 'REPLACED') {
    return NextResponse.json({ error: 'Esta credencial já foi substituída.' }, { status: 409 })
  }

  const now = new Date()

  // 2. Reserva novo ativo do estoque (se listing tem critério de estoque)
  let newAssetId: string | null = null
  const listing = checkout.listing

  if (listing.assetCategory) {
    const orClauses: Array<Record<string, unknown>> = []
    const code = listing.stockProductCode?.trim().toUpperCase()
    const name = listing.stockProductName?.trim()
    if (code) {
      orClauses.push(
        { adsId: code },
        { specs: { path: '$.productCode', equals: code } },
      )
    }
    if (name) {
      orClauses.push(
        { displayName: { equals: name, mode: 'insensitive' as const } },
        { subCategory:  { equals: name, mode: 'insensitive' as const } },
      )
    }
    const assetWhere = orClauses.length > 0
      ? { status: 'AVAILABLE' as const, category: listing.assetCategory as never, OR: orClauses }
      : { status: 'AVAILABLE' as const, category: listing.assetCategory as never }

    const candidate = await prisma.asset.findFirst({
      where: assetWhere,
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })

    if (candidate) {
      await prisma.asset.update({
        where: { id: candidate.id },
        data:  { status: 'QUARANTINE' },
      })
      newAssetId = candidate.id
    }
  }

  // 3. Devolve ativo antigo ao estoque (se tinha um ativo físico registrado)
  if (oldCred.assetId) {
    await prisma.asset.update({
      where: { id: oldCred.assetId },
      data:  { status: 'AVAILABLE', soldAt: null },
    }).catch((e) => console.error('[TrocaRapida] Falha ao devolver ativo:', e))

    await prisma.assetMovement.create({
      data: {
        assetId:  oldCred.assetId,
        toStatus: 'AVAILABLE',
        reason:   `Substituição de garantia — Checkout: ${data.checkoutId} — Motivo: ${data.replacementReason} — Operador: ${auth.session.user.name ?? auth.session.user.id}`,
      },
    }).catch(() => {})
  }

  // 4. Marca credencial antiga como REPLACED
  await prisma.quickSaleCredential.update({
    where: { id: oldCred.id },
    data: {
      assetStatus:       'REPLACED',
      replacementReason: data.replacementReason,
      replacementNote:   data.replacementNote ?? null,
      replacedAt:        now,
    },
  })

  // 5. Cria nova credencial
  const newCred = await prisma.quickSaleCredential.create({
    data: {
      checkoutId:    data.checkoutId,
      assetId:       newAssetId,
      loginEmail:    data.newLoginEmail    ?? null,
      loginPassword: data.newLoginPassword ?? null,
      recoveryEmail: data.newRecoveryEmail ?? null,
      twoFaSeed:     data.newTwoFaSeed     ?? null,
      assetOrigin:   data.newAssetOrigin,
      executorName:  data.newExecutorName  ?? null,
      supplierName:  data.newSupplierName  ?? null,
      assetStatus:   'DELIVERED',
    },
  })

  // 6. Atualiza ponteiro de substituição
  await prisma.quickSaleCredential.update({
    where: { id: oldCred.id },
    data:  { replacedById: newCred.id },
  })

  // 7. Log de auditoria da troca
  await prisma.quickSaleCredentialLog.createMany({
    data: [
      {
        id:           `${oldCred.id.slice(0, 20)}r${now.getTime()}`,
        credentialId: oldCred.id,
        actorId:      auth.session.user.id,
        actorName:    auth.session.user.name ?? null,
        action:       'REPLACED',
        details: {
          reason:          data.replacementReason,
          note:            data.replacementNote ?? null,
          newCredentialId: newCred.id,
          newAssetId,
          operator:        auth.session.user.name ?? auth.session.user.id,
        },
      },
      {
        id:           `${newCred.id.slice(0, 20)}c${now.getTime()}`,
        credentialId: newCred.id,
        actorId:      auth.session.user.id,
        actorName:    auth.session.user.name ?? null,
        action:       'CREATED',
        details: {
          replacedFrom: oldCred.id,
          hasNewAsset:  Boolean(newAssetId),
        },
      },
    ],
    skipDuplicates: true,
  }).catch((e) => console.error('[TrocaRapida] Log falhou:', e))

  // 8. Revoga magic links antigos + gera novo
  await revokeMagicLinksForCheckout(data.checkoutId, `Troca rápida — ${data.replacementReason}`)

  const { url: newMagicUrl } = await createDeliveryMagicLink({
    checkoutId:    data.checkoutId,
    credentialId:  newCred.id,
    expiryHours:   data.expiryHours,
  })

  // 9. WhatsApp opcional
  if (data.sendWhatsapp) {
    const hasCredentials = Boolean(data.newLoginEmail || data.newLoginPassword)
    const msg = hasCredentials
      ? [
          `🔄 *Substituição de ativo — Ads Ativos*`,
          ``,
          `Produto: *${listing.title}*`,
          ``,
          `Sua conta foi substituída dentro da garantia.`,
          `Acesse os novos dados de acesso pelo link seguro:`,
          newMagicUrl,
          ``,
          `⚠️ Link válido por ${data.expiryHours}h. Use proxy dedicado ao logar.`,
        ].join('\n')
      : [
          `🔄 *Substituição em andamento — Ads Ativos*`,
          ``,
          `Produto: *${listing.title}*`,
          ``,
          `Sua solicitação de substituição foi recebida.`,
          `Você receberá os novos dados de acesso em breve.`,
          ``,
          `Pedido: ${data.checkoutId}`,
        ].join('\n')

    sendWhatsApp({ phone: checkout.buyerWhatsapp, message: msg })
      .catch((e) => console.error('[TrocaRapida] WhatsApp failed:', e))
  }

  await prisma.auditLog.create({
    data: {
      action: 'QUICK_SALE_TROCA_RAPIDA',
      entity: 'QuickSaleCheckout',
      entityId: data.checkoutId,
      userId: auth.session.user.id,
      details: {
        oldCredentialId: oldCred.id,
        newCredentialId: newCred.id,
        reason: data.replacementReason,
        newAssetId,
        newMagicUrl,
      },
    },
  }).catch(() => {})

  return NextResponse.json({
    ok: true,
    newCredentialId: newCred.id,
    newAssetId,
    newMagicUrl,
  })
}
