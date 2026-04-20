import type { TrackerCheckoutParamMode, TrackerCheckoutSettings } from '@prisma/client'

/** Chaves mínimas pedidas no produto + comuns de atribuição. */
export const DEFAULT_CHECKOUT_FORWARDED_KEYS: string[] = [
  'gclid',
  'utm_source',
  'utm_campaign',
  'click_id',
  'utm_medium',
  'utm_content',
  'utm_term',
  'gbraid',
  'wbraid',
  'msclkid',
]

export function normalizeForwardedKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_CHECKOUT_FORWARDED_KEYS]
  const out = raw
    .filter((x): x is string => typeof x === 'string' && /^[a-zA-Z0-9_.\-]{1,64}$/.test(x))
    .map((k) => k.toLowerCase())
  const uniq = [...new Set(out)]
  return uniq.length ? uniq : [...DEFAULT_CHECKOUT_FORWARDED_KEYS]
}

export type CheckoutTunnelConfig = {
  forwardedParamKeys: string[]
  paramMode: TrackerCheckoutParamMode
}

export function configFromSettings(
  settings: TrackerCheckoutSettings | null | undefined
): CheckoutTunnelConfig {
  if (!settings) {
    return {
      forwardedParamKeys: [...DEFAULT_CHECKOUT_FORWARDED_KEYS],
      paramMode: 'ALLOWLIST_ONLY' as TrackerCheckoutParamMode,
    }
  }
  return {
    forwardedParamKeys: normalizeForwardedKeys(settings.forwardedParamKeys),
    paramMode: settings.paramMode,
  }
}
