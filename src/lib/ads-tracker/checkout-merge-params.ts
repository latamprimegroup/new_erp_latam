import type { TrackerCheckoutParamMode } from '@prisma/client'

/**
 * Injeta query params do pedido de entrada no URL de checkout, conforme modo allowlist ou preserve-all.
 */
export function mergeInboundParamsOntoCheckoutUrl(
  checkoutTargetUrl: string,
  inboundSearchParams: URLSearchParams,
  mode: TrackerCheckoutParamMode,
  allowKeys: string[]
): URL {
  const target = new URL(checkoutTargetUrl)
  const allow = new Set(allowKeys.map((k) => k.toLowerCase()))

  if (mode === 'PRESERVE_ALL_INBOUND') {
    inboundSearchParams.forEach((v, k) => {
      if (!target.searchParams.has(k)) {
        target.searchParams.set(k, v)
      }
    })
    return target
  }

  for (const key of allow) {
    const v = inboundSearchParams.get(key)
    if (v != null && v !== '') {
      target.searchParams.set(key, v)
    }
  }
  return target
}

export function snapshotSearchParams(sp: URLSearchParams, maxKeys = 48, maxValLen = 400): Record<string, string> {
  const out: Record<string, string> = {}
  let n = 0
  sp.forEach((v, k) => {
    if (n >= maxKeys) return
    out[k] = v.length > maxValLen ? `${v.slice(0, maxValLen)}…` : v
    n++
  })
  return out
}
