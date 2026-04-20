import {
  Prisma,
  TrackerConversionDispatchStatus,
  TrackerConversionEventKind,
  TrackerConversionUpsellMode,
  type TrackerConversionRule,
  TrackerOfferStatus,
  TrackerSalePaymentState,
} from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { computeConversionSendValue } from '@/lib/ads-tracker/conversion-value'
import { trySendOfflineConversionUpload } from '@/lib/ads-tracker/google-offline-conversion-upload'

function ruleMatchesSignal(
  rule: { offerId: string | null; upsellMode: TrackerConversionUpsellMode },
  signal: { offerId: string; isUpsell: boolean }
): boolean {
  if (rule.offerId && rule.offerId !== signal.offerId) return false
  if (rule.upsellMode === TrackerConversionUpsellMode.PRIMARY_ONLY && signal.isUpsell) return false
  if (rule.upsellMode === TrackerConversionUpsellMode.UPSELL_ONLY && !signal.isUpsell) return false
  return true
}

async function upsertDispatchForPair(
  rule: TrackerConversionRule,
  signal: {
    id: string
    offerId: string
    paymentState: TrackerSalePaymentState
    countedForRevenue: boolean
    gclid: string | null
    amountGross: Prisma.Decimal
    currency: string
    createdAt: Date
    isUpsell: boolean
  }
): Promise<'created' | 'updated' | 'skipped' | 'noop'> {
  if (rule.onlyApprovedPurchases && signal.paymentState !== TrackerSalePaymentState.APPROVED) {
    return 'skipped'
  }
  if (!signal.countedForRevenue) return 'skipped'
  if (!ruleMatchesSignal(rule, signal)) return 'skipped'

  const gclid = signal.gclid?.trim() || null
  const valueComputed = computeConversionSendValue(signal.amountGross, rule)
  const scheduledFor = gclid
    ? new Date(signal.createdAt.getTime() + Math.max(0, rule.delayMinutesBeforeSend) * 60_000)
    : new Date()

  const existing = await prisma.trackerConversionDispatch.findUnique({
    where: {
      ruleId_saleSignalId: { ruleId: rule.id, saleSignalId: signal.id },
    },
  })

  if (existing) {
    if (existing.status === TrackerConversionDispatchStatus.SENT) return 'noop'
    if (
      existing.status === TrackerConversionDispatchStatus.SKIPPED_ORGANIC &&
      gclid &&
      existing.matchKind === 'ORGANIC_NO_GCLID'
    ) {
      await prisma.trackerConversionDispatch.update({
        where: { id: existing.id },
        data: {
          status: TrackerConversionDispatchStatus.QUEUED,
          matchKind: 'PAID_GCLID',
          gclidSnapshot: gclid,
          valueComputed,
          scheduledFor,
          processedAt: null,
          errorMessage: null,
        },
      })
      return 'updated'
    }
    return 'noop'
  }

  if (!gclid) {
    const ageMs = Date.now() - signal.createdAt.getTime()
    /** Janela de “delayed match”: postback pode chegar sem gclid e corrigir segundos depois. */
    if (ageMs < 60_000) {
      return 'skipped'
    }
    await prisma.trackerConversionDispatch.create({
      data: {
        ruleId: rule.id,
        saleSignalId: signal.id,
        status: TrackerConversionDispatchStatus.SKIPPED_ORGANIC,
        matchKind: 'ORGANIC_NO_GCLID',
        valueComputed,
        currency: signal.currency,
        scheduledFor,
        processedAt: new Date(),
        gclidSnapshot: null,
      },
    })
    return 'created'
  }

  await prisma.trackerConversionDispatch.create({
    data: {
      ruleId: rule.id,
      saleSignalId: signal.id,
      status: TrackerConversionDispatchStatus.QUEUED,
      matchKind: 'PAID_GCLID',
      valueComputed,
      currency: signal.currency,
      scheduledFor,
      gclidSnapshot: gclid,
    },
  })
  return 'created'
}

/**
 * Cria ou atualiza linhas na fila a partir de sinais de venda (compra aprovada).
 */
export async function enqueueConversionDispatchesFromSaleSignals(): Promise<{
  created: number
  updated: number
}> {
  const rules = await prisma.trackerConversionRule.findMany({
    where: { active: true, eventKind: TrackerConversionEventKind.PURCHASE },
  })
  if (rules.length === 0) return { created: 0, updated: 0 }

  const signals = await prisma.trackerOfferSaleSignal.findMany({
    where: {
      paymentState: TrackerSalePaymentState.APPROVED,
      offer: { status: TrackerOfferStatus.ACTIVE },
    },
    orderBy: { createdAt: 'desc' },
    take: 800,
  })

  let created = 0
  let updated = 0
  for (const sig of signals) {
    for (const rule of rules) {
      const r = await upsertDispatchForPair(rule, sig)
      if (r === 'created') created++
      if (r === 'updated') updated++
    }
  }
  return { created, updated }
}

export async function processDueConversionDispatches(): Promise<{
  processed: number
  sent: number
  errors: string[]
}> {
  const now = new Date()
  const rows = await prisma.trackerConversionDispatch.findMany({
    where: {
      status: TrackerConversionDispatchStatus.QUEUED,
      scheduledFor: { lte: now },
    },
    include: {
      rule: true,
      saleSignal: { include: { offer: true } },
    },
    take: 150,
    orderBy: { scheduledFor: 'asc' },
  })

  const errors: string[] = []
  let sent = 0

  for (const d of rows) {
    if (d.rule.backendAction !== 'OFFLINE_GCLIC_UPLOAD') {
      await prisma.trackerConversionDispatch.update({
        where: { id: d.id },
        data: {
          status: TrackerConversionDispatchStatus.SKIPPED_FILTER,
          processedAt: now,
          errorMessage: 'backend_action não suportado',
        },
      })
      continue
    }
    if (!d.saleSignal) {
      await prisma.trackerConversionDispatch.update({
        where: { id: d.id },
        data: {
          status: TrackerConversionDispatchStatus.FAILED,
          processedAt: now,
          errorMessage: 'Sinal em falta',
        },
      })
      continue
    }

    const upload = await trySendOfflineConversionUpload({
      rule: d.rule,
      gclid: d.gclidSnapshot || d.saleSignal.gclid,
      conversionDateTime: d.saleSignal.createdAt,
      value: d.valueComputed ?? new Prisma.Decimal(0),
      currencyCode: d.currency || 'BRL',
      orderId: d.saleSignal.platformOrderId || d.saleSignal.id,
    })

    if (upload.ok) {
      sent++
      await prisma.trackerConversionDispatch.update({
        where: { id: d.id },
        data: {
          status: TrackerConversionDispatchStatus.SENT,
          processedAt: now,
          errorMessage: null,
        },
      })
      await prisma.trackerOfferSaleSignal.update({
        where: { id: d.saleSignal.id },
        data: {
          googleOfflineSentAt: d.saleSignal.googleOfflineSentAt ?? now,
          googleOfflineError: null,
        },
      })
    } else {
      const msg = upload.error?.slice(0, 500) || 'erro'
      errors.push(`${d.id}: ${msg}`)
      await prisma.trackerConversionDispatch.update({
        where: { id: d.id },
        data: {
          status: TrackerConversionDispatchStatus.FAILED,
          processedAt: now,
          errorMessage: msg,
        },
      })
      await prisma.trackerOfferSaleSignal.update({
        where: { id: d.saleSignal.id },
        data: { googleOfflineError: msg },
      })
    }
  }

  return { processed: rows.length, sent, errors }
}
