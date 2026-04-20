/**
 * Extrai campos de postbacks genéricos / Hotmart / Kiwify para o ROI Tracker.
 */

export function isValidGclid(raw: string | null | undefined): boolean {
  if (raw == null) return false
  const t = String(raw).trim()
  if (t.length < 16 || t.length > 512) return false
  return /^[A-Za-z0-9._\-]+$/.test(t)
}

function asRecord(o: unknown): Record<string, unknown> | null {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null
  return o as Record<string, unknown>
}

export function extractGclidFromPayload(body: Record<string, unknown>): string | null {
  const tryVal = (v: unknown): string | null => {
    if (typeof v === 'string' && isValidGclid(v)) return v.trim()
    return null
  }

  const keys = ['gclid', 'GCLID', 'click_id', 'clickId', 'gcl_id']
  for (const k of keys) {
    const v = tryVal(body[k])
    if (v) return v
  }

  const nests = ['data', 'tracking', 'utm', 'metadata', 'buyer', 'purchase', 'subscription', 'commissions']
  for (const k of nests) {
    const inner = asRecord(body[k])
    if (inner) {
      const v = extractGclidFromPayload(inner)
      if (v) return v
    }
  }

  return null
}

export type DeviceCategory = 'MOBILE' | 'DESKTOP' | 'TABLET' | 'UNKNOWN'

export function extractDeviceCategory(body: Record<string, unknown>): DeviceCategory {
  const pick = (v: unknown): string | null => (typeof v === 'string' ? v.toLowerCase() : null)

  const candidates = [
    pick(body.device),
    pick(body.device_type),
    pick(body.deviceType),
    pick(body.user_device),
  ]

  const data = asRecord(body.data)
  if (data) {
    candidates.push(pick(data.device), pick(data.device_type), pick(data.utm_device))
  }

  const utm = asRecord(body.utm)
  if (utm) {
    candidates.push(pick(utm.device))
  }

  const joined = candidates.filter(Boolean).join(' ')
  if (joined.includes('mobile') || joined.includes('android') || joined.includes('iphone')) return 'MOBILE'
  if (joined.includes('tablet') || joined.includes('ipad')) return 'TABLET'
  if (joined.includes('desktop') || joined.includes('web')) return 'DESKTOP'
  return 'UNKNOWN'
}

export type PaymentStatus = 'CONFIRMED' | 'PENDING'

export function inferPaymentStatus(body: Record<string, unknown>): PaymentStatus {
  const blob = JSON.stringify(body).toLowerCase()
  if (
    blob.includes('boleto') ||
    blob.includes('pix_pend') ||
    blob.includes('waiting_payment') ||
    blob.includes('waiting payment') ||
    blob.includes('pending_payment') ||
    blob.includes('under_review') ||
    blob.includes('in_analysis')
  ) {
    return 'PENDING'
  }

  const status =
    (typeof body.status === 'string' && body.status) ||
    (typeof body.payment_status === 'string' && body.payment_status) ||
    (asRecord(body.data) && typeof asRecord(body.data)!.status === 'string' && (asRecord(body.data)!.status as string)) ||
    ''

  const s = String(status).toLowerCase()
  if (s.includes('pend') || s.includes('wait') || s.includes('boleto') || s.includes('process')) {
    return 'PENDING'
  }
  return 'CONFIRMED'
}

export function extractUniId(body: Record<string, unknown>): string | null {
  const keys = ['uni_id', 'uniId', 'ads_ativos_uni_id', 'vault_uni_id']
  for (const k of keys) {
    const v = body[k]
    if (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v.trim())) return v.trim().toLowerCase()
  }
  const data = asRecord(body.data)
  if (data) return extractUniId(data)
  return null
}
