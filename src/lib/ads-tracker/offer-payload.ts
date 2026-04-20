/**
 * Extração de campos financeiros / pedido a partir de postbacks (Kiwify, Hotmart, genérico).
 */

import { createHash } from 'node:crypto'
import { extractGclidFromPayload, inferPaymentStatus, isValidGclid } from '@/lib/ads-tracker/s2s-payload'
import { TrackerSalePaymentState } from '@prisma/client'

function asRecord(o: unknown): Record<string, unknown> | null {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null
  return o as Record<string, unknown>
}

function getByPath(root: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.').map((p) => p.trim()).filter(Boolean)
  let cur: unknown = root
  for (const p of parts) {
    const rec = asRecord(cur)
    if (!rec) return undefined
    cur = rec[p]
  }
  return cur
}

export function extractClickIdFromField(body: Record<string, unknown>, field: string): string | null {
  const f = (field || 'auto').trim()
  if (!f || f === 'auto') return extractGclidFromPayload(body)
  const v = getByPath(body, f)
  if (typeof v === 'string' && isValidGclid(v)) return v.trim()
  return null
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(',', '.').replace(/[^\d.\-]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * Valor bruto em unidade da moeda (ex.: reais, não centavos).
 */
export function extractGrossAmount(body: Record<string, unknown>): { amount: number; currency: string } | null {
  const currency =
    (typeof body.currency === 'string' && body.currency.trim().slice(0, 8)) ||
    (typeof body.currency_code === 'string' && body.currency_code.trim().slice(0, 8)) ||
    'BRL'

  const tryKeys = [
    'amount',
    'value',
    'price',
    'total',
    'gross_amount',
    'grossAmount',
    'purchase_amount',
    'paid_amount',
    'commission_as',
  ]

  for (const k of tryKeys) {
    const n = asNumber(body[k])
    if (n != null && n >= 0) return { amount: n, currency }
  }

  const data = asRecord(body.data)
  if (data) {
    for (const k of tryKeys) {
      const n = asNumber(data[k])
      if (n != null && n >= 0) return { amount: n, currency }
    }
    const purchase = asRecord(data.purchase)
    if (purchase) {
      const n = asNumber(purchase.price) ?? asNumber(purchase.amount) ?? asNumber(purchase.full_price)
      if (n != null && n >= 0) return { amount: n, currency }
    }
  }

  const purchase = asRecord(body.purchase)
  if (purchase) {
    const n = asNumber(purchase.price) ?? asNumber(purchase.amount)
    if (n != null && n >= 0) return { amount: n, currency }
  }

  return null
}

export function extractPlatformOrderId(body: Record<string, unknown>): string | null {
  const keys = [
    'transaction_id',
    'transactionId',
    'order_id',
    'orderId',
    'purchase_id',
    'purchaseId',
    'subscription_id',
    'subscriptionId',
    'sale_id',
    'saleId',
    'id',
  ]

  for (const k of keys) {
    const v = body[k]
    if (typeof v === 'string' && v.trim().length > 2) return v.trim().slice(0, 200)
    if (typeof v === 'number' && Number.isFinite(v)) return String(v).slice(0, 200)
  }

  const data = asRecord(body.data)
  if (data) {
    for (const k of keys) {
      const v = data[k]
      if (typeof v === 'string' && v.trim().length > 2) return v.trim().slice(0, 200)
    }
    const purchase = asRecord(data.purchase)
    if (purchase && typeof purchase.id === 'string') return purchase.id.trim().slice(0, 200)
  }

  return null
}

export function inferIsUpsell(body: Record<string, unknown>): boolean {
  const blob = JSON.stringify(body).toLowerCase()
  if (
    blob.includes('upsell') ||
    blob.includes('order_bump') ||
    blob.includes('orderbump') ||
    blob.includes('bump_sale') ||
    blob.includes('one_click') ||
    blob.includes('orderbump')
  ) {
    return true
  }
  const flags = [
    body.is_upsell,
    body.isUpsell,
    body.upsell,
    body.order_bump,
    body.orderBump,
    body.bump,
  ]
  return flags.some((v) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true')
}

export function inferOfferPaymentState(body: Record<string, unknown>): TrackerSalePaymentState {
  const blob = JSON.stringify(body).toLowerCase()
  if (blob.includes('chargeback') || blob.includes('charge_back')) return TrackerSalePaymentState.CHARGEBACK
  if (blob.includes('refund') || blob.includes('reembolso') || blob.includes('refunded')) {
    return TrackerSalePaymentState.REFUNDED
  }

  const coarse = inferPaymentStatus(body)
  if (coarse === 'CONFIRMED') return TrackerSalePaymentState.APPROVED
  if (blob.includes('pix')) return TrackerSalePaymentState.PIX_PENDING
  if (blob.includes('boleto')) return TrackerSalePaymentState.BOLETO_PENDING
  return TrackerSalePaymentState.BOLETO_PENDING
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

function hintFromEmail(email: string): string {
  const [u, dom] = email.split('@')
  if (!dom) return email.slice(0, 12)
  const left = (u || '').slice(0, 3)
  return `${left}•••@${dom}`
}

function extractCpfDigits(body: Record<string, unknown>): string | null {
  const keys = ['cpf', 'document', 'tax_id', 'taxId', 'buyer_document', 'customer_cpf']
  for (const k of keys) {
    const v = body[k]
    if (typeof v === 'string') {
      const d = v.replace(/\D/g, '')
      if (d.length === 11) return d
    }
  }
  const data = asRecord(body.data)
  if (data) {
    for (const k of keys) {
      const v = data[k]
      if (typeof v === 'string') {
        const d = v.replace(/\D/g, '')
        if (d.length === 11) return d
      }
    }
    const cust = asRecord(data.customer) || asRecord(data.buyer)
    if (cust) {
      for (const k of keys) {
        const v = cust[k]
        if (typeof v === 'string') {
          const d = v.replace(/\D/g, '')
          if (d.length === 11) return d
        }
      }
    }
  }
  return null
}

function extractEmail(body: Record<string, unknown>): string | null {
  const keys = ['email', 'buyer_email', 'customer_email', 'user_email']
  for (const k of keys) {
    const v = body[k]
    if (typeof v === 'string' && v.includes('@')) {
      const e = v.trim().toLowerCase()
      if (e.length > 4 && e.length < 200) return e
    }
  }
  const data = asRecord(body.data)
  if (data) {
    for (const k of keys) {
      const v = data[k]
      if (typeof v === 'string' && v.includes('@')) {
        const e = v.trim().toLowerCase()
        if (e.length > 4 && e.length < 200) return e
      }
    }
    const cust = asRecord(data.customer) || asRecord(data.buyer)
    if (cust) {
      const v = cust.email ?? cust.mail
      if (typeof v === 'string' && v.includes('@')) {
        const e = v.trim().toLowerCase()
        if (e.length > 4 && e.length < 200) return e
      }
    }
  }
  return null
}

/** Módulo 14 — identidade estável para LTV (e-mail normalizado ou CPF 11 dígitos). */
export function extractBuyerIdentity(body: Record<string, unknown>): { hash: string; hint: string } | null {
  const email = extractEmail(body)
  if (email) {
    return { hash: sha256Hex(`email:${email}`), hint: hintFromEmail(email) }
  }
  const cpf = extractCpfDigits(body)
  if (cpf) {
    return { hash: sha256Hex(`cpf:${cpf}`), hint: `cpf ••••${cpf.slice(-4)}` }
  }
  return null
}

function isLikelyCampaignId(s: string): boolean {
  const t = s.trim()
  return t.length >= 20 && t.length <= 36 && /^[a-z0-9]+$/i.test(t)
}

/**
 * Campanha Ads Tracker de origem — enviar no postback (ex.: ads_tracker_campaign_id) ou em campo custom da plataforma.
 */
export function extractAdsTrackerCampaignId(body: Record<string, unknown>): string | null {
  const keys = [
    'ads_tracker_campaign_id',
    'adsTrackerCampaignId',
    'tracker_campaign_id',
    'trackerCampaignId',
    'campaign_id',
  ]
  for (const k of keys) {
    const v = body[k]
    if (typeof v === 'string' && isLikelyCampaignId(v)) return v.trim()
  }
  const data = asRecord(body.data)
  if (data) {
    for (const k of keys) {
      const v = data[k]
      if (typeof v === 'string' && isLikelyCampaignId(v)) return v.trim()
    }
    const meta = asRecord(data.metadata) || asRecord(data.custom_fields)
    if (meta) {
      for (const k of keys) {
        const v = meta[k]
        if (typeof v === 'string' && isLikelyCampaignId(v)) return v.trim()
      }
    }
  }
  return null
}
