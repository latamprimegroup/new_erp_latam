export type QuickSalePaymentMode = 'PIX' | 'GLOBAL'
export type QuickSaleGlobalGateway = 'KAST' | 'MERCURY'
export type QuickSalePaymentMethod = 'PIX' | QuickSaleGlobalGateway

export const LISTING_PAYMENT_MODE_PREFIX = 'quick_sale_listing_payment_mode:'
export const LISTING_GLOBAL_GATEWAYS_PREFIX = 'quick_sale_listing_global_gateways:'
export const CHECKOUT_PAYMENT_METHOD_PREFIX = 'quick_sale_checkout_payment_method:'
export const CHECKOUT_PAYMENT_PAYLOAD_PREFIX = 'quick_sale_checkout_payment_payload:'
export const QUICK_SALE_ORDER_LOOKUP_PREFIX = 'quick_sale_order_lookup:'
export const QUICK_SALE_MERCURY_REF_PREFIX = 'quick_sale_mercury_ref:'

const GLOBAL_GATEWAY_SET = new Set<QuickSaleGlobalGateway>(['KAST', 'MERCURY'])

export function listingPaymentModeKey(listingId: string) {
  return `${LISTING_PAYMENT_MODE_PREFIX}${listingId}`
}

export function listingGlobalGatewaysKey(listingId: string) {
  return `${LISTING_GLOBAL_GATEWAYS_PREFIX}${listingId}`
}

export function checkoutPaymentMethodKey(checkoutId: string) {
  return `${CHECKOUT_PAYMENT_METHOD_PREFIX}${checkoutId}`
}

export function checkoutPaymentPayloadKey(checkoutId: string) {
  return `${CHECKOUT_PAYMENT_PAYLOAD_PREFIX}${checkoutId}`
}

export function quickSaleOrderLookupKey(orderNumber: string) {
  return `${QUICK_SALE_ORDER_LOOKUP_PREFIX}${orderNumber.trim().toUpperCase()}`
}

export function quickSaleMercuryRefKey(reference: string) {
  return `${QUICK_SALE_MERCURY_REF_PREFIX}${normalizeMercuryReference(reference)}`
}

export function normalizeMercuryReference(reference: string) {
  return reference.trim().toUpperCase()
}

export function parseQuickSalePaymentMode(raw: string | null | undefined): QuickSalePaymentMode {
  return String(raw ?? '').trim().toUpperCase() === 'GLOBAL' ? 'GLOBAL' : 'PIX'
}

export function parseQuickSaleGlobalGateways(raw: string | null | undefined): QuickSaleGlobalGateway[] {
  if (!raw) return ['KAST', 'MERCURY']
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return ['KAST', 'MERCURY']
    const gateways = parsed
      .map((item) => String(item ?? '').trim().toUpperCase())
      .filter((item): item is QuickSaleGlobalGateway => GLOBAL_GATEWAY_SET.has(item as QuickSaleGlobalGateway))
    return gateways.length > 0 ? Array.from(new Set(gateways)) : ['KAST', 'MERCURY']
  } catch {
    return ['KAST', 'MERCURY']
  }
}

export function normalizeQuickSaleGlobalGateways(raw: string[] | null | undefined): QuickSaleGlobalGateway[] {
  const parsed = (raw ?? [])
    .map((item) => String(item ?? '').trim().toUpperCase())
    .filter((item): item is QuickSaleGlobalGateway => GLOBAL_GATEWAY_SET.has(item as QuickSaleGlobalGateway))
  return parsed.length > 0 ? Array.from(new Set(parsed)) : ['KAST', 'MERCURY']
}

export function resolveQuickSalePaymentMethods(
  mode: QuickSalePaymentMode,
  globalGateways: QuickSaleGlobalGateway[],
): QuickSalePaymentMethod[] {
  if (mode === 'PIX') return ['PIX']
  return normalizeQuickSaleGlobalGateways(globalGateways)
}

export function serializeQuickSaleGlobalGateways(gateways: QuickSaleGlobalGateway[]) {
  return JSON.stringify(normalizeQuickSaleGlobalGateways(gateways))
}
