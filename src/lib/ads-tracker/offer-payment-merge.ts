import { TrackerSalePaymentState } from '@prisma/client'

const POSITIVE_RANK: Record<TrackerSalePaymentState, number> = {
  [TrackerSalePaymentState.UNKNOWN]: 0,
  [TrackerSalePaymentState.BOLETO_PENDING]: 1,
  [TrackerSalePaymentState.PIX_PENDING]: 2,
  [TrackerSalePaymentState.APPROVED]: 3,
  [TrackerSalePaymentState.REFUNDED]: 4,
  [TrackerSalePaymentState.CHARGEBACK]: 5,
}

/**
 * Funde estados do mesmo pedido: estados finais negativos prevalecem; entre pendentes/aprovado escolhe o mais avançado.
 */
export function mergeOfferPaymentState(
  prev: TrackerSalePaymentState,
  next: TrackerSalePaymentState
): TrackerSalePaymentState {
  if (next === TrackerSalePaymentState.CHARGEBACK || next === TrackerSalePaymentState.REFUNDED) return next
  if (prev === TrackerSalePaymentState.CHARGEBACK || prev === TrackerSalePaymentState.REFUNDED) return prev
  return POSITIVE_RANK[next] >= POSITIVE_RANK[prev] ? next : prev
}
