import { NextRequest, NextResponse } from 'next/server'
import {
  TrackerCheckoutInitiationOutcome,
  TrackerCheckoutSettings,
  TrackerOffer,
  TrackerOfferStatus,
} from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { configFromSettings } from '@/lib/ads-tracker/checkout-defaults'
import { mergeInboundParamsOntoCheckoutUrl, snapshotSearchParams } from '@/lib/ads-tracker/checkout-merge-params'
import { clientIpFromRequest } from '@/lib/ads-tracker/offer-webhook-security'

export type OfferWithCheckoutSettings = TrackerOffer & {
  checkoutSettings: TrackerCheckoutSettings | null
}

function inboundLooksLikeGoogleAds(sp: URLSearchParams): boolean {
  return Boolean(
    sp.get('gclid') || sp.get('gbraid') || sp.get('wbraid') || sp.get('msclkid') || sp.get('gad_source')
  )
}

export async function handleTrackerPayRedirect(
  req: NextRequest,
  opts: {
    offer: OfferWithCheckoutSettings
    payLabel: string
    viaEphemeral: boolean
  }
): Promise<NextResponse> {
  const { offer, payLabel, viaEphemeral } = opts
  const ip = clientIpFromRequest(req.headers)
  const ua = req.headers.get('user-agent')
  const ref = req.headers.get('referer')
  const sp = req.nextUrl.searchParams
  const fromGoogle = inboundLooksLikeGoogleAds(sp)
  const snap = snapshotSearchParams(sp)

  if (offer.status !== TrackerOfferStatus.ACTIVE) {
    await prisma.trackerCheckoutInitiation.create({
      data: {
        offerId: offer.id,
        sourceIp: ip || '-',
        userAgent: ua?.slice(0, 512) ?? null,
        referer: ref?.slice(0, 2000) ?? null,
        fromGoogleAds: fromGoogle,
        querySnapshot: snap,
        outcome: TrackerCheckoutInitiationOutcome.OFFER_INACTIVE,
        viaEphemeralToken: viaEphemeral,
        paySlugOrToken: payLabel,
      },
    })
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  }

  let target: URL
  try {
    const cfg = configFromSettings(offer.checkoutSettings)
    target = mergeInboundParamsOntoCheckoutUrl(
      offer.checkoutTargetUrl,
      sp,
      cfg.paramMode,
      cfg.forwardedParamKeys
    )
  } catch {
    await prisma.trackerCheckoutInitiation.create({
      data: {
        offerId: offer.id,
        sourceIp: ip || '-',
        userAgent: ua?.slice(0, 512) ?? null,
        referer: ref?.slice(0, 2000) ?? null,
        fromGoogleAds: fromGoogle,
        querySnapshot: snap,
        outcome: TrackerCheckoutInitiationOutcome.INVALID_CHECKOUT_URL,
        viaEphemeralToken: viaEphemeral,
        paySlugOrToken: payLabel,
      },
    })
    return NextResponse.json({ error: 'URL inválida' }, { status: 500 })
  }

  await prisma.trackerCheckoutInitiation.create({
    data: {
      offerId: offer.id,
      sourceIp: ip || '-',
      userAgent: ua?.slice(0, 512) ?? null,
      referer: ref?.slice(0, 2000) ?? null,
      fromGoogleAds: fromGoogle,
      querySnapshot: snap,
      outcome: TrackerCheckoutInitiationOutcome.REDIRECT_302,
      viaEphemeralToken: viaEphemeral,
      paySlugOrToken: payLabel,
    },
  })

  const res = NextResponse.redirect(target.toString(), 302)
  res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  res.headers.set('Referrer-Policy', 'no-referrer')
  return res
}

export async function logPayMiss(
  req: NextRequest,
  outcome: TrackerCheckoutInitiationOutcome,
  payLabel: string,
  offerId: string | null
): Promise<NextResponse> {
  const ip = clientIpFromRequest(req.headers)
  const ua = req.headers.get('user-agent')
  const ref = req.headers.get('referer')
  const sp = req.nextUrl.searchParams
  const fromGoogle = inboundLooksLikeGoogleAds(sp)
  const snap = snapshotSearchParams(sp)
  await prisma.trackerCheckoutInitiation.create({
    data: {
      offerId,
      sourceIp: ip || '-',
      userAgent: ua?.slice(0, 512) ?? null,
      referer: ref?.slice(0, 2000) ?? null,
      fromGoogleAds: fromGoogle,
      querySnapshot: snap,
      outcome,
      viaEphemeralToken:
        outcome === TrackerCheckoutInitiationOutcome.TOKEN_EXPIRED ||
        outcome === TrackerCheckoutInitiationOutcome.TOKEN_EXHAUSTED,
      paySlugOrToken: payLabel,
    },
  })
  return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
}
