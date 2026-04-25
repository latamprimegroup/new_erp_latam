import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ISSUE_SOURCE, issueInvisibleCheckoutAccess, type InvisibleCheckoutMode } from '@/lib/invisible-checkout'
import { listingPaymentModeKey, parseQuickSalePaymentMode } from '@/lib/quick-sale-payments'

function parseMode(raw: string | null): InvisibleCheckoutMode | null {
  const value = String(raw ?? '').trim().toUpperCase()
  if (value === 'PIX' || value === 'GLOBAL') return value
  return null
}

function safeParam(value: string | null, max = 500) {
  const normalized = String(value ?? '').trim()
  return normalized ? normalized.slice(0, max) : null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const slug = safeParam(searchParams.get('slug'), 120)
  if (!slug) {
    return NextResponse.json({ error: 'Slug obrigatório.' }, { status: 400 })
  }

  const listing = await prisma.productListing.findFirst({
    where: { slug, active: true },
    select: { id: true, slug: true },
  }).catch(() => null)
  if (!listing) {
    return NextResponse.json({ error: 'Listing não encontrado.' }, { status: 404 })
  }

  const explicitMode = parseMode(searchParams.get('mode'))
  const modeSetting = await prisma.systemSetting.findUnique({
    where: { key: listingPaymentModeKey(listing.id) },
    select: { value: true },
  }).catch(() => null)
  const inferredMode = parseQuickSalePaymentMode(modeSetting?.value) === 'GLOBAL' ? 'GLOBAL' : 'PIX'
  const paymentMode: InvisibleCheckoutMode = explicitMode ?? inferredMode

  const sellerRef = safeParam(searchParams.get('ref'), 120)
  const utmKeys = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'src',
    'fbclid',
    'gclid',
  ] as const
  const utms = Object.fromEntries(
    utmKeys
      .map((key) => [key, safeParam(searchParams.get(key), 500)] as const)
      .filter(([, value]) => Boolean(value)),
  ) as Record<string, string>

  const access = await issueInvisibleCheckoutAccess({
    listingSlug: listing.slug,
    paymentMode,
    source: ISSUE_SOURCE.PAY_ONE_NEW,
    ttlMinutes: 15,
    maxUses: 1,
    closeOnPaid: true,
    sellerRef,
    utms,
    baseUrl: req.nextUrl.origin,
  }).catch(() => null)

  if (!access) {
    return NextResponse.json({ error: 'Falha ao gerar link seguro.' }, { status: 500 })
  }

  return NextResponse.redirect(access.secureUrl, 302)
}

