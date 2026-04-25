import { NextRequest, NextResponse } from 'next/server'
import {
  buildTrackedDecoyUrl,
  consumeInvisibleCheckoutToken,
  getInvisibleCheckoutDecoyUrl,
  getInvisibleCheckoutPolicy,
  lookupIpIntel,
  shouldCloakInvisibleCheckout,
  trackInvisibleCheckoutProbe,
  trackInvisibleCheckoutShareAlert,
} from '@/lib/invisible-checkout'

const FALLBACK_DECOY_URL =
  process.env.INVISIBLE_CHECKOUT_BAIT_URL?.trim() ||
  '/pagina-isca'

function redirectToDecoy(req: NextRequest, input?: {
  decoyUrl?: string | null
  token?: string
  reason?: string | null
}) {
  const target = buildTrackedDecoyUrl({
    baseUrl: req.nextUrl.origin,
    decoyUrl: input?.decoyUrl || FALLBACK_DECOY_URL,
    token: input?.token,
    reason: input?.reason,
  })
  return NextResponse.redirect(target, 302)
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
  const policy = await getInvisibleCheckoutPolicy().catch(() => ({
    allowedCountries: [] as string[],
    blockedOrgKeywords: [] as string[],
    decoyUrl: FALLBACK_DECOY_URL,
  }))
  const decoyUrl = await getInvisibleCheckoutDecoyUrl().catch(() => policy.decoyUrl || FALLBACK_DECOY_URL)

  if (!tokenData.ok) {
    if (tokenData.reason === 'TOKEN_NOT_FOUND') {
      return NextResponse.json({ error: 'Checkout indisponível.' }, { status: 404 })
    }

    if (tokenData.reason === 'LINK_SHARING_ATTEMPT') {
      await trackInvisibleCheckoutShareAlert({
        token,
        checkoutId: 'checkoutId' in tokenData ? tokenData.checkoutId : null,
        listingId: 'listingId' in tokenData ? tokenData.listingId : null,
        originalIp: 'lockedIp' in tokenData ? tokenData.lockedIp : null,
        sharingAttemptIp: 'requestIp' in tokenData ? tokenData.requestIp : ip,
        userAgent,
      })
    }

    // Honey Pot: qualquer link expirado/invalidado/exaurido/cancelado vai para página isca.
    return redirectToDecoy(req, {
      decoyUrl,
      token,
      reason: tokenData.reason,
    })
  }
  if (!tokenData.redirectPath) {
    return redirectToDecoy(req, {
      decoyUrl,
      token,
      reason: 'MISSING_REDIRECT_PATH',
    })
  }

  const intel = await lookupIpIntel(ip).catch(() => ({ countryCode: null as string | null, org: null as string | null }))
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
      reason: cloak.reason ?? 'CLOAK_BLOCKED',
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
    return redirectToDecoy(req, {
      decoyUrl,
      token,
      reason: cloak.reason ?? 'CLOAK_BLOCKED',
    })
  }

  const url = new URL(tokenData.redirectPath, req.nextUrl.origin)
  return NextResponse.redirect(url, 302)
}

