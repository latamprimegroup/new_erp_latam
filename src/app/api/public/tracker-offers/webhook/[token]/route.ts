import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { Prisma, TrackerOfferIpTrust, TrackerOfferStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  extractClickIdFromField,
  extractGrossAmount,
  extractPlatformOrderId,
  inferIsUpsell,
  inferOfferPaymentState,
} from '@/lib/ads-tracker/offer-payload'
import { recordLtvFromApprovedPostback } from '@/lib/ads-tracker/tracker-ltv'
import { mergeOfferPaymentState } from '@/lib/ads-tracker/offer-payment-merge'
import {
  clientIpFromRequest,
  evaluateIpTrust,
  verifyWebhookHmac,
  webhookIpMode,
} from '@/lib/ads-tracker/offer-webhook-security'

function truncateJson(obj: unknown, max = 12000): unknown {
  try {
    const s = JSON.stringify(obj)
    if (s.length <= max) return obj
    return { _truncated: true, preview: s.slice(0, max) }
  } catch {
    return null
  }
}

async function parseBody(req: NextRequest, raw: string): Promise<Record<string, unknown>> {
  const ct = req.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    try {
      const j = JSON.parse(raw) as unknown
      if (j && typeof j === 'object' && !Array.isArray(j)) return j as Record<string, unknown>
    } catch {
      /* fallthrough */
    }
  }
  if (ct.includes('application/x-www-form-urlencoded') || raw.includes('=')) {
    try {
      const p = new URLSearchParams(raw)
      const o: Record<string, unknown> = {}
      p.forEach((v, k) => {
        o[k] = v
      })
      if (Object.keys(o).length) return o
    } catch {
      /* fallthrough */
    }
  }
  try {
    const j = JSON.parse(raw) as unknown
    if (j && typeof j === 'object' && !Array.isArray(j)) return j as Record<string, unknown>
  } catch {
    /* empty */
  }
  return {}
}

function dedupeKeyFor(offerId: string, orderId: string | null, gclid: string | null, rawBody: string): string {
  if (orderId) {
    return createHash('sha256').update(`${offerId}|oid|${orderId}`).digest('hex')
  }
  if (gclid) {
    return createHash('sha256').update(`${offerId}|gcl|${gclid}`).digest('hex')
  }
  return createHash('sha256').update(`${offerId}|${rawBody}`).digest('hex')
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token || token.length > 48) {
    return NextResponse.json({ error: 'inválido' }, { status: 400 })
  }

  const offer = await prisma.trackerOffer.findFirst({
    where: { postbackPublicToken: token, status: { not: TrackerOfferStatus.ARCHIVED } },
  })
  if (!offer) {
    return NextResponse.json({ error: 'não encontrado' }, { status: 404 })
  }

  const rawBody = await req.text()
  const headerSig =
    req.headers.get('x-tracker-signature')?.trim() ||
    req.headers.get('x-signature')?.trim() ||
    null
  const signatureValid = headerSig ? verifyWebhookHmac(offer.webhookSecret, rawBody, headerSig) : false

  const body = await parseBody(req, rawBody)
  const ip = clientIpFromRequest(req.headers)
  const { trust: ipTrust, allowed: ipAllowedRaw } = evaluateIpTrust(ip)
  const mode = webhookIpMode()
  let ipAllowed = ipAllowedRaw
  if (mode === 'strict' && !ipAllowedRaw && ipTrust !== TrackerOfferIpTrust.ALLOWLIST_DISABLED) {
    await prisma.trackerOffer.update({
      where: { id: offer.id },
      data: { lastWebhookAt: new Date(), lastWebhookOk: false },
    })
    return NextResponse.json({ error: 'ip não autorizado' }, { status: 403 })
  }
  if (mode === 'soft' && !ipAllowedRaw && ipTrust !== TrackerOfferIpTrust.ALLOWLIST_DISABLED) {
    ipAllowed = false
  }

  const platformOrderId = extractPlatformOrderId(body)
  const clickField = offer.clickIdField || 'auto'
  const gclidExtracted = extractClickIdFromField(body, clickField)
  const dedupeKey = dedupeKeyFor(offer.id, platformOrderId, gclidExtracted, rawBody)

  const paymentNext = inferOfferPaymentState(body)
  const gross = extractGrossAmount(body)
  const amountNew = gross?.amount ?? 0
  const currency = gross?.currency ?? 'BRL'
  const countedForRevenue = ipAllowed

  const existing = await prisma.trackerOfferSaleSignal.findUnique({
    where: { offerId_dedupeKey: { offerId: offer.id, dedupeKey } },
  })

  const paymentState = existing ? mergeOfferPaymentState(existing.paymentState, paymentNext) : paymentNext
  const dNew = new Prisma.Decimal(amountNew)
  const amountGross =
    existing && existing.amountGross.greaterThan(dNew) ? existing.amountGross : dNew
  const gclid = gclidExtracted ?? existing?.gclid ?? null
  const upsellNext = inferIsUpsell(body)
  const isUpsell = existing ? upsellNext || existing.isUpsell : upsellNext

  const payloadSnapshot = truncateJson(body) as object | undefined

  try {
    const row = existing
      ? await prisma.trackerOfferSaleSignal.update({
          where: { id: existing.id },
          data: {
            platformOrderId: platformOrderId ?? existing.platformOrderId,
            amountGross,
            currency,
            paymentState,
            gclid,
            isUpsell,
            payloadSnapshot,
            sourceIp: ip || existing.sourceIp,
            ipTrust,
            signatureValid: signatureValid || existing.signatureValid,
            countedForRevenue: existing.countedForRevenue === true || countedForRevenue,
          },
        })
      : await prisma.trackerOfferSaleSignal.create({
          data: {
            offerId: offer.id,
            dedupeKey,
            platformOrderId,
            amountGross,
            currency,
            paymentState,
            gclid,
            isUpsell,
            payloadSnapshot,
            sourceIp: ip,
            ipTrust,
            signatureValid,
            countedForRevenue,
          },
        })

    await prisma.trackerOffer.update({
      where: { id: offer.id },
      data: { lastWebhookAt: new Date(), lastWebhookOk: true },
    })

    void recordLtvFromApprovedPostback({
      prisma,
      offerId: offer.id,
      saleSignalId: row.id,
      body,
      paymentState: row.paymentState,
      amountGross: row.amountGross,
      currency: row.currency,
      platformOrderId: row.platformOrderId,
      countedForRevenue: row.countedForRevenue,
    }).catch((e) => console.error('[tracker-ltv]', e))
  } catch (e) {
    await prisma.trackerOffer.update({
      where: { id: offer.id },
      data: { lastWebhookAt: new Date(), lastWebhookOk: false },
    })
    console.error('[tracker-offers webhook]', e)
    return NextResponse.json({ error: 'persistência' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/** Algumas plataformas permitem teste GET — regista sinal mínimo. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const offer = await prisma.trackerOffer.findFirst({
    where: { postbackPublicToken: token, status: { not: TrackerOfferStatus.ARCHIVED } },
  })
  if (!offer) return NextResponse.json({ error: 'não encontrado' }, { status: 404 })

  const sp = req.nextUrl.searchParams
  const body: Record<string, unknown> = {}
  sp.forEach((v, k) => {
    body[k] = v
  })

  const rawBody = JSON.stringify(body)
  const ip = clientIpFromRequest(req.headers)
  const { trust: ipTrust, allowed: ipAllowedRaw } = evaluateIpTrust(ip)
  const mode = webhookIpMode()
  if (mode === 'strict' && !ipAllowedRaw && ipTrust !== TrackerOfferIpTrust.ALLOWLIST_DISABLED) {
    await prisma.trackerOffer.update({
      where: { id: offer.id },
      data: { lastWebhookAt: new Date(), lastWebhookOk: false },
    })
    return NextResponse.json({ error: 'ip não autorizado' }, { status: 403 })
  }
  let ipAllowed = ipAllowedRaw || ipTrust === TrackerOfferIpTrust.ALLOWLIST_DISABLED
  if (mode === 'soft' && !ipAllowedRaw && ipTrust !== TrackerOfferIpTrust.ALLOWLIST_DISABLED) {
    ipAllowed = false
  }

  const platformOrderId = extractPlatformOrderId(body)
  const gclidExtracted = extractClickIdFromField(body, offer.clickIdField || 'auto')
  const dedupeKey = dedupeKeyFor(offer.id, platformOrderId, gclidExtracted, rawBody)
  const paymentState = inferOfferPaymentState(body)
  const gross = extractGrossAmount(body)
  const amountNew = gross?.amount ?? 0

  const existing = await prisma.trackerOfferSaleSignal.findUnique({
    where: { offerId_dedupeKey: { offerId: offer.id, dedupeKey } },
  })
  const paymentMerged = existing ? mergeOfferPaymentState(existing.paymentState, paymentState) : paymentState
  const dNew = new Prisma.Decimal(amountNew)
  const amountGross =
    existing && existing.amountGross.greaterThan(dNew) ? existing.amountGross : dNew
  const upsellNext = inferIsUpsell(body)
  const isUpsell = existing ? upsellNext || existing.isUpsell : upsellNext

  try {
    const row = existing
      ? await prisma.trackerOfferSaleSignal.update({
          where: { id: existing.id },
          data: {
            platformOrderId: platformOrderId ?? existing.platformOrderId,
            amountGross,
            currency: gross?.currency ?? existing.currency,
            paymentState: paymentMerged,
            gclid: gclidExtracted ?? existing.gclid,
            isUpsell,
            payloadSnapshot: truncateJson(body) as object,
            sourceIp: ip || existing.sourceIp,
            ipTrust,
            countedForRevenue: existing.countedForRevenue === true || ipAllowed,
          },
        })
      : await prisma.trackerOfferSaleSignal.create({
          data: {
            offerId: offer.id,
            dedupeKey,
            platformOrderId,
            amountGross,
            currency: gross?.currency ?? 'BRL',
            paymentState: paymentMerged,
            gclid: gclidExtracted,
            isUpsell,
            payloadSnapshot: truncateJson(body) as object,
            sourceIp: ip,
            ipTrust,
            signatureValid: false,
            countedForRevenue: ipAllowed,
          },
        })

    await prisma.trackerOffer.update({
      where: { id: offer.id },
      data: { lastWebhookAt: new Date(), lastWebhookOk: true },
    })

    void recordLtvFromApprovedPostback({
      prisma,
      offerId: offer.id,
      saleSignalId: row.id,
      body,
      paymentState: row.paymentState,
      amountGross: row.amountGross,
      currency: row.currency,
      platformOrderId: row.platformOrderId,
      countedForRevenue: row.countedForRevenue,
    }).catch((e) => console.error('[tracker-ltv]', e))
  } catch (e) {
    await prisma.trackerOffer.update({
      where: { id: offer.id },
      data: { lastWebhookAt: new Date(), lastWebhookOk: false },
    })
    console.error('[tracker-offers webhook GET]', e)
    return NextResponse.json({ error: 'persistência' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
