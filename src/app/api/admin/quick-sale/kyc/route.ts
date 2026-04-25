import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { sendUtmifyQuickSaleConversion } from '@/lib/utmify'
import { sendWhatsApp, sendWhatsAppEliteDelivery } from '@/lib/notifications/channels/whatsapp'
import { buildDeliveryEmail, sendEmail } from '@/lib/notifications/channels/email'
import {
  adspowerMoveProfile,
  getQuickSaleAdspowerProfileRef,
  getQuickSaleKycFileMeta,
  getQuickSaleKycMeta,
  resolveQuickSaleAdspowerGroupId,
} from '@/lib/smart-delivery-system'

export const runtime = 'nodejs'

function parseReservedAssetIds(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
}

function normalizeCredentialMap(rawData: unknown) {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) return undefined
  const entries = Object.entries(rawData as Record<string, unknown>)
  const mapped = entries.reduce<Record<string, string>>((acc, [key, value]) => {
    if (value == null) return acc
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      const text = String(value).trim()
      if (text) acc[key] = text
    }
    return acc
  }, {})
  return Object.keys(mapped).length > 0 ? mapped : undefined
}

export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'COMMERCIAL'])
  if (!auth.ok) return auth.response

  const limitParam = Number.parseInt(req.nextUrl.searchParams.get('limit') ?? '100', 10)
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(200, limitParam)) : 100
  const query = String(req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase()

  const rows = await prisma.quickSaleCheckout.findMany({
    where: {
      status: 'PAID',
      deliveryFlowStatus: 'PENDING_KYC',
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      buyerName: true,
      buyerCpf: true,
      buyerEmail: true,
      buyerWhatsapp: true,
      qty: true,
      totalAmount: true,
      updatedAt: true,
      paidAt: true,
      deliveryStatusNote: true,
      listing: {
        select: {
          id: true,
          title: true,
          slug: true,
        },
      },
    },
  })

  const enriched = await Promise.all(
    rows.map(async (checkout) => {
      const [kycMeta, fileMeta] = await Promise.all([
        getQuickSaleKycMeta(checkout.id),
        getQuickSaleKycFileMeta(checkout.id),
      ])
      return {
        id: checkout.id,
        buyerName: checkout.buyerName,
        buyerCpf: checkout.buyerCpf,
        buyerEmail: checkout.buyerEmail,
        buyerWhatsapp: checkout.buyerWhatsapp,
        qty: checkout.qty,
        totalAmount: Number(checkout.totalAmount),
        updatedAt: checkout.updatedAt,
        paidAt: checkout.paidAt,
        deliveryStatusNote: checkout.deliveryStatusNote,
        listing: checkout.listing,
        kyc: {
          riskReasons: kycMeta?.riskReasons ?? [],
          minValueForKyc: kycMeta?.minValueForKyc ?? null,
          submitted: Boolean(fileMeta?.documentPath && fileMeta?.selfiePath),
          fileMeta,
        },
      }
    }),
  )

  const filtered = query
    ? enriched.filter((item) =>
      [
        item.id,
        item.buyerName,
        item.buyerCpf,
        item.buyerEmail ?? '',
        item.buyerWhatsapp,
        item.listing.title,
        item.listing.slug,
      ].some((part) => part.toLowerCase().includes(query)))
    : enriched

  return NextResponse.json({
    items: filtered,
    total: filtered.length,
  })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'COMMERCIAL'])
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const input = body as {
    checkoutId?: string
    action?: 'APPROVE' | 'REJECT'
    note?: string
  }
  const checkoutId = String(input.checkoutId ?? '').trim()
  const action = input.action
  if (!checkoutId || (action !== 'APPROVE' && action !== 'REJECT')) {
    return NextResponse.json({ error: 'checkoutId e action válidos são obrigatórios.' }, { status: 422 })
  }

  const checkout = await prisma.quickSaleCheckout.findUnique({
    where: { id: checkoutId },
    select: {
      id: true,
      status: true,
      listingId: true,
      deliveryFlowStatus: true,
      buyerName: true,
      buyerEmail: true,
      buyerWhatsapp: true,
      buyerCpf: true,
      totalAmount: true,
      qty: true,
      createdAt: true,
      paidAt: true,
      warrantyEndsAt: true,
      utmifySent: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      utmContent: true,
      utmTerm: true,
      utmSrc: true,
      reservedAssetIds: true,
      listing: {
        select: {
          title: true,
          slug: true,
          destinationProfile: true,
        },
      },
    },
  }).catch(() => null)

  if (!checkout) {
    return NextResponse.json({ error: 'Checkout não encontrado.' }, { status: 404 })
  }
  if (checkout.status !== 'PAID' || checkout.deliveryFlowStatus !== 'PENDING_KYC') {
    return NextResponse.json({ error: 'Checkout não está em fila PENDING_KYC.' }, { status: 409 })
  }

  if (action === 'REJECT') {
    await prisma.quickSaleCheckout.update({
      where: { id: checkout.id },
      data: {
        deliveryStatusNote: input.note?.trim() || 'KYC rejeitado. Entre em contato com suporte para revisão.',
      },
    }).catch(() => {})
    await prisma.auditLog.create({
      data: {
        action: 'QUICK_SALE_KYC_REJECTED',
        entity: 'QuickSaleCheckout',
        entityId: checkout.id,
        userId: auth.session.user.id,
        details: {
          checkoutId: checkout.id,
          note: input.note?.trim() || null,
        },
      },
    }).catch(() => {})
    return NextResponse.json({ ok: true, checkoutId: checkout.id, action })
  }

  const ref = await getQuickSaleAdspowerProfileRef(checkout.id).catch(() => null)
  let moveResult: { moved: boolean; reason?: string; profileId?: string; groupId?: string } = { moved: false }
  if (ref?.profileId) {
    const groupId = ref.groupId || await resolveQuickSaleAdspowerGroupId(checkout.listingId)
    if (groupId) {
      try {
        await adspowerMoveProfile({
          profileId: ref.profileId,
          targetGroupId: groupId,
        })
        moveResult = { moved: true, profileId: ref.profileId, groupId }
      } catch {
        moveResult = { moved: false, reason: 'ADSPWER_MOVE_FAILED', profileId: ref.profileId, groupId }
      }
    } else {
      moveResult = { moved: false, reason: 'NO_GROUP_MAPPING', profileId: ref.profileId }
    }
  } else {
    moveResult = { moved: false, reason: 'NO_PROFILE_REFERENCE' }
  }

  await prisma.quickSaleCheckout.update({
    where: { id: checkout.id },
    data: {
      deliveryFlowStatus: moveResult.moved ? 'DELIVERED' : 'WAITING_CUSTOMER_DATA',
      deliverySent: Boolean(moveResult.moved),
      deliveryStatusNote: moveResult.moved
        ? 'KYC aprovado e entrega automática concluída.'
        : (input.note?.trim() || 'KYC aprovado. Checkout liberado para fluxo de entrega.'),
    },
  }).catch(() => {})

  let utmifySynced = Boolean(checkout.utmifySent)
  if (!checkout.utmifySent) {
    const paidAt = checkout.paidAt ?? new Date()
    const utmifyResult = await sendUtmifyQuickSaleConversion({
      checkoutId: checkout.id,
      listingTitle: checkout.listing.title,
      listingSlug: checkout.listing.slug,
      totalAmount: Number(checkout.totalAmount),
      qty: checkout.qty,
      paidAt,
      createdAt: checkout.createdAt,
      profileType: checkout.listing.destinationProfile ?? null,
      buyer: {
        name: checkout.buyerName,
        email: checkout.buyerEmail,
        whatsapp: checkout.buyerWhatsapp,
        document: checkout.buyerCpf,
      },
      utms: {
        utm_source: checkout.utmSource ?? undefined,
        utm_medium: checkout.utmMedium ?? undefined,
        utm_campaign: checkout.utmCampaign ?? undefined,
        utm_content: checkout.utmContent ?? undefined,
        utm_term: checkout.utmTerm ?? undefined,
        src: checkout.utmSrc ?? undefined,
      },
    }).catch((e) => {
      console.error('[QuickSaleKYC] Utmify lead_verified falhou:', e)
      return { ok: false }
    })

    utmifySynced = Boolean(utmifyResult.ok)
    if (utmifyResult.ok) {
      await prisma.quickSaleCheckout.update({
        where: { id: checkout.id },
        data: {
          utmifySent: true,
          utmifyOrderId: ('utmifyOrderId' in utmifyResult ? utmifyResult.utmifyOrderId : null) ?? null,
        },
      }).catch(() => {})
    }
  }

  const appBase = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  const panelUrl = appBase
    ? `${appBase}/loja/${checkout.listing.slug}?checkoutId=${encodeURIComponent(checkout.id)}`
    : ''
  const reservedAssetIds = parseReservedAssetIds(checkout.reservedAssetIds)
  const deliveredAsset = reservedAssetIds.length > 0
    ? await prisma.asset.findFirst({
      where: { id: { in: reservedAssetIds } },
      select: { displayName: true, rawData: true },
    }).catch(() => null)
    : null

  const credentials = deliveredAsset?.rawData && typeof deliveredAsset.rawData === 'object'
    ? (deliveredAsset.rawData as Record<string, unknown>)
    : null
  const emailCredentials = normalizeCredentialMap(deliveredAsset?.rawData)

  let whatsappSent = false
  let emailSent = false

  if (moveResult.moved) {
    whatsappSent = await sendWhatsAppEliteDelivery({
      whatsapp: checkout.buyerWhatsapp,
      buyerName: checkout.buyerName,
      productTitle: checkout.listing.title,
      checkoutId: checkout.id,
      credentials,
      warrantyEndsAt: checkout.warrantyEndsAt ?? null,
      memberAreaUrl: panelUrl || undefined,
    }).catch((e) => {
      console.error('[QuickSaleKYC] WhatsApp final pós-aprovação falhou:', e)
      return false
    })
  } else {
    const fallbackMessage = [
      '✅ *KYC aprovado na Ads Ativos*',
      '',
      `Pedido: #${checkout.id}`,
      `Produto: ${checkout.listing.title}`,
      '',
      'Seu pagamento foi validado, porém a entrega automática não conseguiu concluir o movimento no AdsPower.',
      panelUrl || 'Acesse o painel da loja para acompanhar a liberação.',
      '',
      'Nossa equipe já foi notificada para finalizar a liberação manual.',
    ].join('\n')
    whatsappSent = await sendWhatsApp({
      phone: checkout.buyerWhatsapp,
      message: fallbackMessage,
    }).catch(() => false)
  }

  if (checkout.buyerEmail) {
    const deliveryEmail = buildDeliveryEmail({
      buyerName: checkout.buyerName,
      buyerEmail: checkout.buyerEmail,
      productTitle: checkout.listing.title,
      orderId: checkout.id,
      credentials: emailCredentials,
      warrantyEndsAt: checkout.warrantyEndsAt ?? null,
      panelUrl: panelUrl || undefined,
    })
    emailSent = await sendEmail({
      to: checkout.buyerEmail,
      subject: deliveryEmail.subject,
      html: deliveryEmail.html,
      text: deliveryEmail.text,
    }).catch((e) => {
      console.error('[QuickSaleKYC] E-mail final pós-aprovação falhou:', e)
      return false
    })
  }

  await prisma.auditLog.create({
    data: {
      action: 'QUICK_SALE_KYC_APPROVED',
      entity: 'QuickSaleCheckout',
      entityId: checkout.id,
      userId: auth.session.user.id,
      details: {
        checkoutId: checkout.id,
        moveResult,
        note: input.note?.trim() || null,
        utmifySynced,
        whatsappSent,
        emailSent,
      },
    },
  }).catch(() => {})

  return NextResponse.json({
    ok: true,
    checkoutId: checkout.id,
    action,
    moveResult,
    utmifySynced,
    whatsappSent,
    emailSent,
  })
}
