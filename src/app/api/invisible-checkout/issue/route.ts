import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  ISSUE_SOURCE,
  createInvisibleCheckoutLink,
  type InvisibleCheckoutMode,
} from '@/lib/invisible-checkout'
import { listingPaymentModeKey, parseQuickSalePaymentMode } from '@/lib/quick-sale-payments'

function normalizeMode(value: string | null): InvisibleCheckoutMode | null {
  const raw = String(value ?? '').trim().toUpperCase()
  if (raw === 'PIX' || raw === 'GLOBAL') return raw
  return null
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!['ADMIN', 'CEO', 'COMMERCIAL'].includes(session.user.role ?? '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const slug = String(searchParams.get('slug') ?? '').trim()
  if (!slug || slug.length > 120) {
    return NextResponse.json({ error: 'Slug inválido.' }, { status: 422 })
  }

  const listing = await prisma.productListing.findFirst({
    where: { slug, active: true },
    select: { id: true, slug: true },
  })
  if (!listing) {
    return NextResponse.json({ error: 'Listing não encontrado.' }, { status: 404 })
  }

  const modeFromQuery = normalizeMode(searchParams.get('mode'))
  const modeSetting = await prisma.systemSetting.findUnique({
    where: { key: listingPaymentModeKey(listing.id) },
    select: { value: true },
  }).catch(() => null)
  const modeFromListing = parseQuickSalePaymentMode(modeSetting?.value) === 'GLOBAL' ? 'GLOBAL' : 'PIX'
  const mode = modeFromQuery ?? modeFromListing

  const checkoutId = String(searchParams.get('checkoutId') ?? '').trim() || null
  const sellerRef = String(searchParams.get('ref') ?? '').trim() || null
  const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src', 'fbclid', 'gclid'] as const
  const utms = Object.fromEntries(
    utmKeys.map((key) => [key, String(searchParams.get(key) ?? '').trim() || null]),
  )

  const token = await createInvisibleCheckoutLink({
    checkoutId,
    listingSlug: listing.slug,
    mode,
    ttlMinutes: 15,
    maxUses: 1,
    closeOnPaid: true,
    sellerRef,
    utms,
    source: ISSUE_SOURCE.PAY_ONE_NEW,
  }).catch(() => null)

  if (!token) {
    return NextResponse.json({ error: 'Não foi possível gerar link seguro agora.' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    mode,
    listingSlug: listing.slug,
    secureCheckoutUrl: token.secureUrl,
    legacyCheckoutUrl: token.legacyUrl,
    token: token.token,
    expiresAt: token.expiresAt,
  })
}
