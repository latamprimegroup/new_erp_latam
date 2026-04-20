export type TrafficUtmBlueprint = Partial<
  Record<'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_content' | 'utm_term', string>
>

export type TrafficCustomPair = { key: string; value: string }

export type TrafficParamBlueprint = {
  clickIdParam: string
  /** Quando true, não acrescentamos gclid ao URL gerado — espera-se auto-tagging na conta Google Ads. */
  assumeAutoTagging: boolean
  utm: TrafficUtmBlueprint
  customPairs: TrafficCustomPair[]
}

export function isTrafficParamBlueprint(x: unknown): x is TrafficParamBlueprint {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false
  const o = x as Record<string, unknown>
  if (typeof o.clickIdParam !== 'string') return false
  if (typeof o.assumeAutoTagging !== 'boolean') return false
  if (!o.utm || typeof o.utm !== 'object' || Array.isArray(o.utm)) return false
  if (!Array.isArray(o.customPairs)) return false
  return true
}

export function normalizeBlueprint(raw: unknown): TrafficParamBlueprint {
  if (isTrafficParamBlueprint(raw)) {
    return {
      clickIdParam: raw.clickIdParam.trim().slice(0, 64) || 'gclid',
      assumeAutoTagging: raw.assumeAutoTagging,
      utm: {
        utm_source: typeof raw.utm.utm_source === 'string' ? raw.utm.utm_source : undefined,
        utm_medium: typeof raw.utm.utm_medium === 'string' ? raw.utm.utm_medium : undefined,
        utm_campaign: typeof raw.utm.utm_campaign === 'string' ? raw.utm.utm_campaign : undefined,
        utm_content: typeof raw.utm.utm_content === 'string' ? raw.utm.utm_content : undefined,
        utm_term: typeof raw.utm.utm_term === 'string' ? raw.utm.utm_term : undefined,
      },
      customPairs: raw.customPairs
        .filter((p): p is TrafficCustomPair => typeof p?.key === 'string' && typeof p?.value === 'string')
        .map((p) => ({
          key: p.key.trim().slice(0, 64),
          value: p.value.trim().slice(0, 512),
        }))
        .filter((p) => p.key.length > 0),
    }
  }
  return defaultGoogleBlueprint()
}

export function defaultGoogleBlueprint(): TrafficParamBlueprint {
  return {
    clickIdParam: 'gclid',
    assumeAutoTagging: true,
    utm: {
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: '{campaignid}',
      utm_content: '{creative}',
      utm_term: '{keyword}',
    },
    customPairs: [
      { key: 'adgroupid', value: '{adgroupid}' },
      { key: 'device', value: '{device}' },
      { key: 'matchtype', value: '{matchtype}' },
      { key: 'network', value: '{network}' },
      { key: 'placement', value: '{placement}' },
    ],
  }
}

export function normalizeGlobalParams(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const kk = k.trim().slice(0, 64)
    if (!kk || typeof v !== 'string') continue
    out[kk] = v.trim().slice(0, 512)
  }
  return out
}

export function countActiveBlueprintSlots(bp: TrafficParamBlueprint, global: Record<string, string>): number {
  let n = Object.keys(global).length
  if (bp.clickIdParam) n += 1
  for (const v of Object.values(bp.utm)) {
    if (v && String(v).trim()) n += 1
  }
  for (const p of bp.customPairs) {
    if (p.key && p.value) n += 1
  }
  return n
}
