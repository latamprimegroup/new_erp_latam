import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import {
  adspowerMoveProfile,
  getQuickSaleAdspowerProfileRef,
  getQuickSaleKycFileMeta,
  getQuickSaleKycMeta,
  resolveQuickSaleAdspowerGroupId,
} from '@/lib/smart-delivery-system'

export const runtime = 'nodejs'

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
      },
    },
  }).catch(() => {})

  return NextResponse.json({
    ok: true,
    checkoutId: checkout.id,
    action,
    moveResult,
  })
}
