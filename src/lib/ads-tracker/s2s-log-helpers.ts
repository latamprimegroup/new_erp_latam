import type { Prisma } from '@prisma/client'
import {
  TrackerConversionDispatchStatus,
  TrackerSalePaymentState,
  type TrackerCheckoutInitiation,
  type TrackerConversionDispatch,
} from '@prisma/client'

export function paymentStateEventLabel(state: TrackerSalePaymentState): string {
  switch (state) {
    case TrackerSalePaymentState.APPROVED:
      return 'Aprovado'
    case TrackerSalePaymentState.BOLETO_PENDING:
      return 'Boleto'
    case TrackerSalePaymentState.PIX_PENDING:
      return 'Pix'
    case TrackerSalePaymentState.REFUNDED:
      return 'Reembolsado'
    case TrackerSalePaymentState.CHARGEBACK:
      return 'Chargeback'
    default:
      return 'Outro'
  }
}

export type GoogleSendUiStatus = 'SENT' | 'FAILED' | 'QUEUED' | 'SKIPPED' | 'PENDING_LEGACY' | 'DISABLED' | 'NONE'

export function aggregateGoogleStatus(
  dispatches: Pick<TrackerConversionDispatch, 'status'>[],
  legacy: {
    googleOfflineSentAt: Date | null
    googleOfflineError: string | null
    paymentState: TrackerSalePaymentState
    gclid: string | null
  },
  offlineEnabled: boolean
): { ui: GoogleSendUiStatus; detail: string } {
  if (!offlineEnabled) {
    return { ui: 'DISABLED', detail: 'TRACKER_OFFLINE_GADS_ENABLED≠1' }
  }

  if (dispatches.length > 0) {
    if (dispatches.some((d) => d.status === TrackerConversionDispatchStatus.SENT)) {
      return { ui: 'SENT', detail: 'Enviado (regra Módulo 08)' }
    }
    if (dispatches.some((d) => d.status === TrackerConversionDispatchStatus.FAILED)) {
      return { ui: 'FAILED', detail: 'Erro na API / envio' }
    }
    if (dispatches.some((d) => d.status === TrackerConversionDispatchStatus.QUEUED)) {
      return { ui: 'QUEUED', detail: 'Na fila / aguarda janela' }
    }
    if (
      dispatches.every(
        (d) =>
          d.status === TrackerConversionDispatchStatus.SKIPPED_ORGANIC ||
          d.status === TrackerConversionDispatchStatus.SKIPPED_FILTER
      )
    ) {
      return { ui: 'SKIPPED', detail: 'Ignorado (orgânico ou filtro)' }
    }
  }

  if (legacy.googleOfflineSentAt) {
    return { ui: 'SENT', detail: 'Enviado (legado por oferta)' }
  }
  if (legacy.googleOfflineError) {
    return { ui: 'FAILED', detail: legacy.googleOfflineError.slice(0, 200) }
  }
  if (legacy.paymentState === TrackerSalePaymentState.APPROVED && legacy.gclid) {
    return { ui: 'PENDING_LEGACY', detail: 'Pendente — cron / fila legado' }
  }
  if (!legacy.gclid) {
    return { ui: 'NONE', detail: 'Sem GCLID para atribuir' }
  }
  return { ui: 'SKIPPED', detail: 'Não elegível para envio' }
}

export function checkoutTargetHostname(url: string): string | null {
  try {
    return new URL(url).hostname || null
  } catch {
    return null
  }
}

export function pickInitiationForSignal(
  signal: { id: string; offerId: string; gclid: string | null; createdAt: Date },
  inits: TrackerCheckoutInitiation[]
): TrackerCheckoutInitiation | null {
  const windowStart = new Date(signal.createdAt.getTime() - 50 * 60_000)
  const windowEnd = new Date(signal.createdAt.getTime() + 5 * 60_000)
  const candidates = inits.filter(
    (i) =>
      i.offerId === signal.offerId &&
      i.createdAt >= windowStart &&
      i.createdAt <= windowEnd
  )
  if (candidates.length === 0) return null
  const g = signal.gclid?.trim()
  if (g) {
    const blobMatch = candidates.find((i) => {
      const snap = i.querySnapshot
      if (snap == null) return false
      try {
        return JSON.stringify(snap).includes(g)
      } catch {
        return false
      }
    })
    if (blobMatch) return blobMatch
  }
  return candidates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
}

const PRICE_ALERT_RATIO = 0.35

export function pricingAlertMessage(
  amountGross: Prisma.Decimal,
  referenceBrl: Prisma.Decimal | null | undefined
): string | null {
  if (referenceBrl == null) return null
  const ref = Number(referenceBrl.toString())
  const amt = Number(amountGross.toString())
  if (!Number.isFinite(ref) || ref <= 0 || !Number.isFinite(amt)) return null
  const diff = Math.abs(amt - ref) / ref
  if (diff < PRICE_ALERT_RATIO) return null
  return `Possível erro de precificação: valor do postback (${amt.toFixed(2)}) afasta-se do referencial da oferta (${ref.toFixed(2)} BRL).`
}

export function delayedMatchPending(createdAt: Date, gclid: string | null): boolean {
  if (gclid) return false
  return Date.now() - createdAt.getTime() < 60_000
}

export function orphanSignal(createdAt: Date, gclid: string | null): boolean {
  if (gclid) return false
  return Date.now() - createdAt.getTime() >= 60_000
}
