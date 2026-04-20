import { NextResponse } from 'next/server'
import { Prisma, TrackerSalePaymentState } from '@prisma/client'
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

function paymentWhere(
  filter: string | null
): Prisma.TrackerOfferSaleSignalWhereInput | Record<string, never> {
  if (filter === 'approved') return { paymentState: TrackerSalePaymentState.APPROVED }
  if (filter === 'boleto') return { paymentState: TrackerSalePaymentState.BOLETO_PENDING }
  if (filter === 'pix') return { paymentState: TrackerSalePaymentState.PIX_PENDING }
  return {}
}

export async function GET(req: Request) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const hours = Math.min(168, Math.max(1, Number(searchParams.get('hours') || '72') || 72))
  const since = new Date(Date.now() - hours * 60 * 60 * 1000)
  const take = Math.min(100, Math.max(1, Number(searchParams.get('take') || '40') || 40))
  const skip = Math.max(0, Number(searchParams.get('skip') || '0') || 0)
  const paymentFilter = searchParams.get('payment')?.trim() || 'all'

  const where: Prisma.TrackerOfferSaleSignalWhereInput = {
    updatedAt: { gte: since },
    ...paymentWhere(paymentFilter === 'all' ? null : paymentFilter),
  }

  const offlineEnabled = process.env.TRACKER_OFFLINE_GADS_ENABLED === '1'

  const [total, rows] = await Promise.all([
    prisma.trackerOfferSaleSignal.count({ where }),
    prisma.trackerOfferSaleSignal.findMany({
      where,
      include: {
        offer: {
          select: {
            name: true,
            platform: true,
            checkoutTargetUrl: true,
            referenceGrossBrl: true,
          },
        },
        conversionDispatches: { select: { status: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take,
      skip,
    }),
  ])

  let initiations: Awaited<ReturnType<typeof prisma.trackerCheckoutInitiation.findMany>> = []
  if (rows.length) {
    const offerIds = [...new Set(rows.map((r) => r.offerId))]
    const minT = new Date(Math.min(...rows.map((r) => r.createdAt.getTime())) - 50 * 60_000)
    const maxT = new Date(Math.max(...rows.map((r) => r.createdAt.getTime())) + 5 * 60_000)
    initiations = await prisma.trackerCheckoutInitiation.findMany({
      where: {
        offerId: { in: offerIds },
        createdAt: { gte: minT, lte: maxT },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  const events = rows.map((s) => {
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
    const init = pickInitiationForSignal(s, initiations)
    const checkoutHost = checkoutTargetHostname(s.offer.checkoutTargetUrl)
    const pricingAlert = pricingAlertMessage(s.amountGross, s.offer.referenceGrossBrl)

    return {
      id: s.id,
      platformOrderId: s.platformOrderId,
      platform: s.offer.platform,
      offerName: s.offer.name,
      eventLabel: paymentStateEventLabel(s.paymentState),
      paymentState: s.paymentState,
      amountGross: s.amountGross.toFixed(2),
      currency: s.currency,
      gclid: s.gclid,
      gclidShort: s.gclid ? `${s.gclid.slice(0, 20)}${s.gclid.length > 20 ? '…' : ''}` : null,
      googleStatus: g.ui,
      googleDetail: g.detail,
      delayedMatchPending: delayedMatchPending(s.createdAt, s.gclid),
      orphanSignal: orphanSignal(s.createdAt, s.gclid),
      pricingAlert,
      checkoutGatewayHost: checkoutHost,
      checkoutTunnel: init
        ? {
            viaEphemeral: init.viaEphemeralToken,
            outcome: init.outcome,
            paySlugOrToken: init.paySlugOrToken,
            initiatedAt: init.createdAt.toISOString(),
          }
        : null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }
  })

  return NextResponse.json({ events, total, offlineEnabled })
}
