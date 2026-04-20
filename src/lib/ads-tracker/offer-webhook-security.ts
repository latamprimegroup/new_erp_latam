/**
 * IP allowlist opcional e assinatura HMAC opcional para webhooks de ofertas.
 *
 * IPs oficiais de gateways mudam — manter TRACKER_OFFER_WEBHOOK_IPS atualizado ou usar modo soft.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { TrackerOfferIpTrust } from '@prisma/client'

export function clientIpFromRequest(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first.slice(0, 45)
  }
  const real = headers.get('x-real-ip')
  if (real?.trim()) return real.trim().slice(0, 45)
  return ''
}

function parseAllowlist(): string[] {
  const raw = process.env.TRACKER_OFFER_WEBHOOK_IPS?.trim()
  if (!raw) return []
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export type IpCheckMode = 'off' | 'soft' | 'strict'

export function webhookIpMode(): IpCheckMode {
  const m = (process.env.TRACKER_OFFER_IP_MODE || 'off').trim().toLowerCase()
  if (m === 'soft' || m === 'strict') return m
  return 'off'
}

export function evaluateIpTrust(ip: string): { trust: TrackerOfferIpTrust; allowed: boolean } {
  const list = parseAllowlist()
  if (list.length === 0) {
    return { trust: TrackerOfferIpTrust.ALLOWLIST_DISABLED, allowed: true }
  }
  if (!ip) {
    return { trust: TrackerOfferIpTrust.ALLOWLIST_FAIL, allowed: false }
  }
  const ok = list.some((entry) => entry === ip || (entry.includes('/') && cidrMatch(ip, entry)))
  if (ok) return { trust: TrackerOfferIpTrust.ALLOWLIST_OK, allowed: true }
  return { trust: TrackerOfferIpTrust.ALLOWLIST_FAIL, allowed: false }
}

/** CIDR mínimo IPv4 (ex.: 203.0.113.0/24). IPv6 não suportado aqui. */
function cidrMatch(ip: string, cidr: string): boolean {
  const [base, bits] = cidr.split('/')
  if (!base || bits == null) return false
  const n = parseInt(bits, 10)
  if (!Number.isFinite(n) || n < 0 || n > 32) return false
  const a = ipv4ToInt(ip)
  const b = ipv4ToInt(base)
  if (a == null || b == null) return false
  const mask = n === 0 ? 0 : (~0 << (32 - n)) >>> 0
  return (a & mask) === (b & mask)
}

function ipv4ToInt(ip: string): number | null {
  const p = ip.split('.')
  if (p.length !== 4) return null
  let n = 0
  for (const part of p) {
    const x = parseInt(part, 10)
    if (!Number.isFinite(x) || x < 0 || x > 255) return null
    n = (n << 8) + x
  }
  return n >>> 0
}

export function verifyWebhookHmac(secret: string, rawBody: string, headerSig: string | null): boolean {
  if (!headerSig || !secret) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const got = headerSig.trim().toLowerCase().replace(/^sha256=/, '')
  if (!/^[a-f0-9]+$/i.test(got) || got.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(got.toLowerCase(), 'utf8'))
  } catch {
    return false
  }
}
