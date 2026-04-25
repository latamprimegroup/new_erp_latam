import { NextRequest, NextResponse } from 'next/server'
import {
  consumeInvisibleCheckoutToken,
  getInvisibleCheckoutDecoyUrl,
  lookupIpIntel,
  shouldCloakInvisibleCheckout,
  trackInvisibleCheckoutProbe,
} from '@/lib/invisible-checkout'

const FALLBACK_REDIRECT_URL =
  process.env.INVISIBLE_CHECKOUT_BAIT_URL?.trim() ||
  'https://news.ycombinator.com'

function redirectToFallback() {
  return NextResponse.redirect(FALLBACK_REDIRECT_URL, 302)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token || token.length > 128) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || ''
  const userAgent = req.headers.get('user-agent') || ''

  const tokenData = await consumeInvisibleCheckoutToken(token, {
    ip,
    userAgent,
    reason: 'LINK_OPENED',
  })

  if (!tokenData.ok || !tokenData.redirectPath) {
    return NextResponse.json({ error: 'Checkout indisponível.' }, { status: 404 })
  }

  const intel = await lookupIpIntel(ip).catch(() => ({ countryCode: null as string | null, org: null as string | null }))
  const policy = await (async () => ({
    allowedCountries: tokenData.allowedCountries,
    blockedOrgKeywords: [] as string[],
    decoyUrl: FALLBACK_REDIRECT_URL,
  }))()
  const cloak = shouldCloakInvisibleCheckout({
    ip,
    userAgent,
    allowedCountries: tokenData.allowedCountries?.length > 0 ? tokenData.allowedCountries : policy.allowedCountries,
    countryCode: intel.countryCode,
    org: intel.org,
    blockedOrgKeywords: policy.blockedOrgKeywords,
  })

  if (cloak.blocked) {
    await trackInvisibleCheckoutProbe({
      token,
      reason: cloak.reason,
      checkoutId: tokenData.checkoutId,
      listingId: tokenData.listingId,
      ip,
      userAgent,
      countryCode: cloak.countryCode ?? null,
      details: {
        source: 'invisible_checkout_gate',
        org: intel.org ?? null,
        note: 'Acesso bloqueado por política de cloaking.',
      },
    })
    const decoy = await getInvisibleCheckoutDecoyUrl().catch(() => policy.decoyUrl || FALLBACK_REDIRECT_URL)
    return NextResponse.redirect(decoy, 302)
  }

  const url = new URL(tokenData.redirectPath, req.nextUrl.origin)
  return NextResponse.redirect(url, 302)
}

