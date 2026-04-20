import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import {
  aggregateGoogleStatus,
  checkoutTargetHostname,
  delayedMatchPending,
  orphanSignal,
  paymentStateEventLabel,
  pickInitiationForSignal,
  pricingAlertMessage,
} from '@/lib/ads-tracker/s2s-log-helpers'

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'FINANCE'] as const

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const s = await prisma.trackerOfferSaleSignal.findUnique({
    where: { id },
    include: {
      offer: {
        select: {
          name: true,
          platform: true,
          checkoutTargetUrl: true,
          referenceGrossBrl: true,
        },
      },
      conversionDispatches: true,
    },
  })
  if (!s) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const offlineEnabled = process.env.TRACKER_OFFLINE_GADS_ENABLED === '1'
  const g = aggregateGoogleStatus(
    s.conversionDispatches,
    {
      googleOfflineSentAt: s.googleOfflineSentAt,
      googleOfflineError: s.googleOfflineError,
      paymentState: s.paymentState,
      gclid: s.gclid,
    },
    offlineEnabled
  )

  const windowStart = new Date(s.createdAt.getTime() - 50 * 60_000)
  const windowEnd = new Date(s.createdAt.getTime() + 5 * 60_000)
  const inits = await prisma.trackerCheckoutInitiation.findMany({
    where: {
      offerId: s.offerId,
      createdAt: { gte: windowStart, lte: windowEnd },
    },
    orderBy: { createdAt: 'desc' },
  })
  const init = pickInitiationForSignal(s, inits)

  let payloadRaw: string
  try {
    payloadRaw =
      s.payloadSnapshot === null || s.payloadSnapshot === undefined
        ? 'null'
        : JSON.stringify(s.payloadSnapshot, null, 2)
  } catch {
    payloadRaw = String(s.payloadSnapshot)
  }

  return NextResponse.json({
    event: {
      id: s.id,
      platformOrderId: s.platformOrderId,
      platform: s.offer.platform,
      offerName: s.offer.name,
      eventLabel: paymentStateEventLabel(s.paymentState),
      paymentState: s.paymentState,
      amountGross: s.amountGross.toFixed(2),
      currency: s.currency,
      gclid: s.gclid,
      googleStatus: g.ui,
      googleDetail: g.detail,
      delayedMatchPending: delayedMatchPending(s.createdAt, s.gclid),
      orphanSignal: orphanSignal(s.createdAt, s.gclid),
      pricingAlert: pricingAlertMessage(s.amountGross, s.offer.referenceGrossBrl),
      checkoutGatewayHost: checkoutTargetHostname(s.offer.checkoutTargetUrl),
      checkoutTunnel: init
        ? {
            viaEphemeral: init.viaEphemeralToken,
            outcome: init.outcome,
            paySlugOrToken: init.paySlugOrToken,
            querySnapshot: init.querySnapshot,
            initiatedAt: init.createdAt.toISOString(),
          }
        : null,
      dispatches: s.conversionDispatches.map((d) => ({
        id: d.id,
        status: d.status,
        matchKind: d.matchKind,
        scheduledFor: d.scheduledFor.toISOString(),
        processedAt: d.processedAt?.toISOString() ?? null,
        errorMessage: d.errorMessage,
      })),
      countedForRevenue: s.countedForRevenue,
      signatureValid: s.signatureValid,
      sourceIp: s.sourceIp,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    },
    payloadRaw,
  })
}
