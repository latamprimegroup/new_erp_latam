import type { NextRequest } from 'next/server'

export function verifyCheckoutPulseSecret(req: NextRequest | Request): boolean {
  const secret = process.env.ECOSYSTEM_CHECKOUT_PULSE_SECRET?.trim()
  if (!secret) return false
  const auth = req.headers.get('authorization')
  const bearer = auth?.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  const h = req.headers.get('x-checkout-pulse-token')?.trim() ?? ''
  return secret.length > 0 && (secret === bearer || secret === h)
}
