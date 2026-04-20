import { NextRequest, NextResponse } from 'next/server'
import {
  TrackerConversionEventKind,
  TrackerOfferStatus,
  TrackerSalePaymentState,
} from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  enqueueConversionDispatchesFromSaleSignals,
  processDueConversionDispatches,
} from '@/lib/ads-tracker/conversion-dispatch-pipeline'
import { trySendGoogleOfflineForSignal } from '@/lib/ads-tracker/google-offline-offer'

/**
 * GET /api/cron/tracker-offers/google-offline?secret=CRON_SECRET
 *
 * Se existir regra ativa PURCHASE (Módulo 08), usa fila + dedupe por regra+sinal.
 * Caso contrário, mantém comportamento legado por oferta.
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (process.env.TRACKER_OFFLINE_GADS_ENABLED !== '1') {
    return NextResponse.json({
      skipped: true,
      reason: 'Defina TRACKER_OFFLINE_GADS_ENABLED=1 quando a integração Google estiver pronta.',
    })
  }

  const ruleCount = await prisma.trackerConversionRule.count({
    where: { active: true, eventKind: TrackerConversionEventKind.PURCHASE },
  })

  if (ruleCount > 0) {
    const enq = await enqueueConversionDispatchesFromSaleSignals()
    const proc = await processDueConversionDispatches()
    return NextResponse.json({
      mode: 'conversion_rules',
      enqueue: enq,
      process: proc,
    })
  }

  const now = Date.now()
  const candidates = await prisma.trackerOfferSaleSignal.findMany({
    where: {
      countedForRevenue: true,
      paymentState: TrackerSalePaymentState.APPROVED,
      gclid: { not: null },
      googleOfflineSentAt: null,
      offer: { status: TrackerOfferStatus.ACTIVE },
    },
    include: { offer: true },
    take: 200,
    orderBy: { createdAt: 'asc' },
  })

  let processed = 0
  let sent = 0
  const errors: string[] = []

  for (const s of candidates) {
    const delayMs = Math.max(0, s.offer.googleOfflineDelayMinutes) * 60_000
    if (now - s.createdAt.getTime() < delayMs) continue

    processed++
    const r = await trySendGoogleOfflineForSignal(s.offer, s)
    if (r.ok) {
      sent++
      await prisma.trackerOfferSaleSignal.update({
        where: { id: s.id },
        data: { googleOfflineSentAt: new Date(), googleOfflineError: null },
      })
    } else {
      const msg = r.error?.slice(0, 500) || 'erro'
      errors.push(`${s.id}: ${msg}`)
      await prisma.trackerOfferSaleSignal.update({
        where: { id: s.id },
        data: { googleOfflineError: msg },
      })
    }
  }

  return NextResponse.json({
    mode: 'legacy_offer_delay',
    processed,
    sent,
    errors: errors.slice(0, 20),
  })
}
