import {
  TrackerConversionDispatchStatus,
  TrackerConversionEventKind,
  TrackerOfferStatus,
  TrackerSalePaymentState,
} from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { processDueConversionDispatches } from '@/lib/ads-tracker/conversion-dispatch-pipeline'
import { trySendGoogleOfflineForSignal } from '@/lib/ads-tracker/google-offline-offer'

/**
 * Re-processar envio Google (regras M08 ou legado por oferta).
 */
export async function reprocessTrackerSaleSignal(signalId: string): Promise<{
  ok: boolean
  mode: 'rules' | 'legacy' | 'none'
  message: string
}> {
  const signal = await prisma.trackerOfferSaleSignal.findUnique({
    where: { id: signalId },
    include: { offer: true },
  })
  if (!signal) return { ok: false, mode: 'none', message: 'Sinal não encontrado' }
  if (signal.offer.status !== TrackerOfferStatus.ACTIVE) {
    return { ok: false, mode: 'none', message: 'Oferta não está ativa' }
  }

  const ruleCount = await prisma.trackerConversionRule.count({
    where: { active: true, eventKind: TrackerConversionEventKind.PURCHASE },
  })

  if (ruleCount > 0) {
    const dispatches = await prisma.trackerConversionDispatch.findMany({
      where: { saleSignalId: signalId },
    })

    for (const d of dispatches) {
      if (d.status === TrackerConversionDispatchStatus.SENT) continue

      if (d.status === TrackerConversionDispatchStatus.SKIPPED_ORGANIC) {
        const g = signal.gclid?.trim()
        if (!g) continue
        await prisma.trackerConversionDispatch.update({
          where: { id: d.id },
          data: {
            status: TrackerConversionDispatchStatus.QUEUED,
            matchKind: 'PAID_GCLID',
            gclidSnapshot: g,
            scheduledFor: new Date(),
            processedAt: null,
            errorMessage: null,
          },
        })
        continue
      }

      if (
        d.status === TrackerConversionDispatchStatus.FAILED ||
        d.status === TrackerConversionDispatchStatus.SKIPPED_FILTER
      ) {
        await prisma.trackerConversionDispatch.update({
          where: { id: d.id },
          data: {
            status: TrackerConversionDispatchStatus.QUEUED,
            scheduledFor: new Date(),
            processedAt: null,
            errorMessage: null,
          },
        })
      }
    }

    const proc = await processDueConversionDispatches()
    return {
      ok: true,
      mode: 'rules',
      message: `Fila reprocessada: ${proc.processed} processados, ${proc.sent} enviados.`,
    }
  }

  if (signal.paymentState !== TrackerSalePaymentState.APPROVED) {
    return { ok: false, mode: 'legacy', message: 'Legado só reenvia vendas aprovadas.' }
  }
  if (!signal.gclid?.trim()) {
    return { ok: false, mode: 'legacy', message: 'Sem GCLID no sinal.' }
  }
  if (!signal.countedForRevenue) {
    return { ok: false, mode: 'legacy', message: 'Sinal não contabilizado (IP/HMAC).' }
  }

  await prisma.trackerOfferSaleSignal.update({
    where: { id: signalId },
    data: { googleOfflineSentAt: null, googleOfflineError: null },
  })

  const fresh = await prisma.trackerOfferSaleSignal.findUnique({
    where: { id: signalId },
    include: { offer: true },
  })
  if (!fresh) return { ok: false, mode: 'legacy', message: 'Sinal perdido após reset' }

  const r = await trySendGoogleOfflineForSignal(fresh.offer, fresh)
  if (r.ok) {
    await prisma.trackerOfferSaleSignal.update({
      where: { id: signalId },
      data: { googleOfflineSentAt: new Date(), googleOfflineError: null },
    })
    return { ok: true, mode: 'legacy', message: 'Enviado (fluxo legado).' }
  }

  const msg = r.error?.slice(0, 500) || 'erro'
  await prisma.trackerOfferSaleSignal.update({
    where: { id: signalId },
    data: { googleOfflineError: msg },
  })
  return { ok: false, mode: 'legacy', message: msg }
}
