import { randomBytes } from 'crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getPublicAppBaseUrl } from '@/lib/public-app-url'
import { listingPaymentModeKey, parseQuickSalePaymentMode } from '@/lib/quick-sale-payments'

const INVISIBLE_TOKEN_PREFIX = 'quick_sale_invisible_token:'
const INVISIBLE_ALLOWED_COUNTRIES_KEY = 'quick_sale_invisible_allowed_countries'
const INVISIBLE_DECOY_URL_KEY = 'quick_sale_invisible_decoy_url'
const INVISIBLE_BLOCKED_ORG_KEYWORDS = 'quick_sale_invisible_blocked_org_keywords'

const DEFAULT_ALLOWED_COUNTRIES = ['BR', 'US']
const DEFAULT_BLOCKED_ORG_KEYWORDS = [
  'vpn',
  'proxy',
  'datacenter',
  'cloud',
  'aws',
  'azure',
  'google cloud',
  'digitalocean',
  'vultr',
  'linode',
  'hetzner',
  'ovh',
  'choopa',
]
const DEFAULT_DECOY_URL =
  process.env.INVISIBLE_CHECKOUT_BAIT_URL?.trim()
  || 'https://news.ycombinator.com'

const DEFAULT_TTL_MINUTES = 15
const DEFAULT_MAX_USES = 1

export const ISSUE_SOURCE = {
  API_LOJA_PIX: 'API_LOJA_PIX',
  API_GLOBAL_LOJA: 'API_GLOBAL_LOJA',
  API_SELLER_DASHBOARD: 'API_SELLER_DASHBOARD',
  API_ADMIN_LISTINGS: 'API_ADMIN_LISTINGS',
  PAY_ONE_NEW: 'PAY_ONE_NEW',
} as const

export type InvisibleCheckoutMode = 'PIX' | 'GLOBAL'

type InvisibleTokenRecord = {
  token: string
  mode: InvisibleCheckoutMode
  listingSlug: string
  checkoutId: string | null
  createdAt: string
  expiresAt: string
  useCount: number
  maxUses: number
  status: 'ACTIVE' | 'INVALIDATED'
  invalidatedReason: string | null
  closeOnPaid: boolean
  allowedCountries: string[]
  sellerRef: string | null
  utms: Record<string, string>
  source: string | null
  lockedIp: string | null
  lastAccessAt: string | null
  lastUserAgent: string | null
}

function tokenKey(token: string) {
  return `${INVISIBLE_TOKEN_PREFIX}${token}`
}

function toJson(value: unknown) {
  return JSON.stringify(value)
}

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function normalizeBaseUrl(baseUrl?: string | null) {
  const base = String(
    baseUrl
    || getPublicAppBaseUrl()
    || process.env.NEXTAUTH_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || ''
  ).trim()
  if (!base) return ''
  return base.replace(/\/$/, '')
}

function parseIp(ip: string | null | undefined) {
  return String(ip ?? '').trim().slice(0, 45) || null
}

function firstForwardedIp(headers: Headers) {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (forwarded) return parseIp(forwarded)
  const real = headers.get('x-real-ip')?.trim()
  if (real) return parseIp(real)
  return null
}

function normalizeUtmMap(input?: Record<string, string | null | undefined>) {
  if (!input) return {}
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(input)) {
    const safeValue = String(value ?? '').trim()
    if (!safeValue) continue
    normalized[key] = safeValue.slice(0, 500)
  }
  return normalized
}

export async function getInvisiblePolicySettings() {
  const rows = await prisma.systemSetting.findMany({
    where: {
      key: {
        in: [
          INVISIBLE_ALLOWED_COUNTRIES_KEY,
          INVISIBLE_DECOY_URL_KEY,
          INVISIBLE_BLOCKED_ORG_KEYWORDS,
        ],
      },
    },
    select: { key: true, value: true },
  }).catch(() => [])
  const map = new Map(rows.map((row) => [row.key, row.value]))
  const allowedCountries = String(map.get(INVISIBLE_ALLOWED_COUNTRIES_KEY) ?? '')
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
  const blockedOrgKeywords = String(map.get(INVISIBLE_BLOCKED_ORG_KEYWORDS) ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  const decoyUrl = String(map.get(INVISIBLE_DECOY_URL_KEY) ?? '').trim() || DEFAULT_DECOY_URL
  return {
    allowedCountries: allowedCountries.length > 0 ? allowedCountries : DEFAULT_ALLOWED_COUNTRIES,
    blockedOrgKeywords: blockedOrgKeywords.length > 0 ? blockedOrgKeywords : DEFAULT_BLOCKED_ORG_KEYWORDS,
    decoyUrl,
  }
}

async function readTokenRecord(token: string) {
  const row = await prisma.systemSetting.findUnique({
    where: { key: tokenKey(token) },
    select: { value: true },
  }).catch(() => null)
  return parseJson<InvisibleTokenRecord>(row?.value)
}

async function saveTokenRecord(record: InvisibleTokenRecord) {
  await prisma.systemSetting.upsert({
    where: { key: tokenKey(record.token) },
    create: { key: tokenKey(record.token), value: toJson(record) },
    update: { value: toJson(record) },
  })
}

function buildLegacyCheckoutPath(input: {
  mode: InvisibleCheckoutMode
  listingSlug: string
  checkoutId?: string | null
  sellerRef?: string | null
  utms?: Record<string, string>
}) {
  const basePath = input.mode === 'GLOBAL'
    ? `/loja-global/${encodeURIComponent(input.listingSlug)}`
    : `/loja/${encodeURIComponent(input.listingSlug)}`
  const query = new URLSearchParams()
  if (input.checkoutId) query.set('checkoutId', input.checkoutId)
  if (input.sellerRef) query.set('ref', input.sellerRef)
  for (const [key, value] of Object.entries(input.utms ?? {})) {
    query.set(key, value)
  }
  const raw = query.toString()
  return raw ? `${basePath}?${raw}` : basePath
}

export function buildInvisibleOneTimeCheckoutUrl(token: string, baseUrl?: string | null) {
  return `${normalizeBaseUrl(baseUrl)}/pay/one/${encodeURIComponent(token)}`
}

export function buildQuickSaleInvisibleLink(mode: InvisibleCheckoutMode, slug: string, baseUrl?: string | null) {
  const params = new URLSearchParams({
    mode,
    slug,
  })
  return `${normalizeBaseUrl(baseUrl)}/pay/one/new?${params.toString()}`
}

export async function issueInvisibleCheckoutAccess(input: {
  checkoutId?: string | null
  listingSlug: string
  paymentMode: InvisibleCheckoutMode
  source?: string
  ttlMinutes?: number
  maxUses?: number
  closeOnPaid?: boolean
  sellerRef?: string | null
  utms?: Record<string, string | null | undefined>
  baseUrl?: string | null
}) {
  const policy = await getInvisiblePolicySettings()
  const token = randomBytes(20).toString('base64url')
  const ttlMinutes = Math.max(1, Math.min(180, Number(input.ttlMinutes ?? DEFAULT_TTL_MINUTES)))
  const maxUses = Math.max(1, Math.min(3, Number(input.maxUses ?? DEFAULT_MAX_USES)))
  const now = Date.now()
  const record: InvisibleTokenRecord = {
    token,
    mode: input.paymentMode,
    listingSlug: input.listingSlug,
    checkoutId: input.checkoutId ?? null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMinutes * 60_000).toISOString(),
    useCount: 0,
    maxUses,
    status: 'ACTIVE',
    invalidatedReason: null,
    closeOnPaid: input.closeOnPaid !== false,
    allowedCountries: policy.allowedCountries,
    sellerRef: String(input.sellerRef ?? '').trim() || null,
    utms: normalizeUtmMap(input.utms),
    source: input.source ?? null,
    lockedIp: null,
    lastAccessAt: null,
    lastUserAgent: null,
  }
  await saveTokenRecord(record)
  const secureUrl = buildInvisibleOneTimeCheckoutUrl(token, input.baseUrl)
  const legacyUrl = buildLegacyCheckoutPath({
    mode: input.paymentMode,
    listingSlug: input.listingSlug,
    checkoutId: input.checkoutId ?? null,
    sellerRef: record.sellerRef,
    utms: record.utms,
  })
  return {
    token,
    secureUrl,
    legacyUrl,
    expiresAt: record.expiresAt,
    allowedCountries: record.allowedCountries,
  }
}

export async function createInvisibleCheckoutLink(input: {
  checkoutId?: string | null
  listingSlug: string
  mode: InvisibleCheckoutMode
  ttlMinutes?: number
  maxUses?: number
  closeOnPaid?: boolean
  sellerRef?: string | null
  utms?: Record<string, string | null | undefined>
  source?: string
  baseUrl?: string | null
}) {
  return issueInvisibleCheckoutAccess({
    checkoutId: input.checkoutId ?? null,
    listingSlug: input.listingSlug,
    paymentMode: input.mode,
    ttlMinutes: input.ttlMinutes,
    maxUses: input.maxUses,
    closeOnPaid: input.closeOnPaid,
    sellerRef: input.sellerRef ?? null,
    utms: input.utms,
    source: input.source ?? ISSUE_SOURCE.API_SELLER_DASHBOARD,
    baseUrl: input.baseUrl,
  })
}

export async function invalidateInvisibleCheckoutToken(token: string, reason: string) {
  const record = await readTokenRecord(token)
  if (!record) return false
  if (record.status === 'INVALIDATED') return true
  record.status = 'INVALIDATED'
  record.invalidatedReason = reason.slice(0, 120)
  await saveTokenRecord(record)
  return true
}

async function checkoutClosed(checkoutId: string | null) {
  if (!checkoutId) return false
  const row = await prisma.quickSaleCheckout.findUnique({
    where: { id: checkoutId },
    select: { status: true },
  }).catch(() => null)
  if (!row) return true
  return row.status === 'PAID' || row.status === 'CANCELLED' || row.status === 'EXPIRED'
}

export async function consumeInvisibleCheckoutToken(token: string, input?: {
  ip?: string | null
  userAgent?: string | null
  reason?: string
}) {
  const record = await readTokenRecord(token)
  if (!record) return { ok: false as const, reason: 'TOKEN_NOT_FOUND' as const }
  if (record.status !== 'ACTIVE') return { ok: false as const, reason: 'TOKEN_INVALIDATED' as const }
  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    await invalidateInvisibleCheckoutToken(token, 'TOKEN_EXPIRED').catch(() => {})
    return { ok: false as const, reason: 'TOKEN_EXPIRED' as const }
  }
  if (record.useCount >= record.maxUses) {
    await invalidateInvisibleCheckoutToken(token, 'TOKEN_EXHAUSTED').catch(() => {})
    return { ok: false as const, reason: 'TOKEN_EXHAUSTED' as const }
  }
  if (record.closeOnPaid && await checkoutClosed(record.checkoutId)) {
    await invalidateInvisibleCheckoutToken(token, 'CHECKOUT_CLOSED').catch(() => {})
    return { ok: false as const, reason: 'CHECKOUT_CLOSED' as const }
  }

  const requestIp = parseIp(input?.ip)
  if (!record.lockedIp && requestIp) record.lockedIp = requestIp
  record.useCount += 1
  record.lastAccessAt = new Date().toISOString()
  record.lastUserAgent = String(input?.userAgent ?? '').slice(0, 300) || null
  await saveTokenRecord(record)

  const redirectPath = buildLegacyCheckoutPath({
    mode: record.mode,
    listingSlug: record.listingSlug,
    checkoutId: record.checkoutId,
    sellerRef: record.sellerRef,
    utms: record.utms,
  })
  return {
    ok: true as const,
    checkoutId: record.checkoutId,
    listingSlug: record.listingSlug,
    listingId: record.listingSlug,
    redirectPath,
    mode: record.mode,
    allowedCountries: record.allowedCountries,
    lockedIp: record.lockedIp,
  }
}

export async function lookupIpIntel(ip: string | null) {
  if (!ip) return { countryCode: null as string | null, org: null as string | null }
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 1500)
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timeout)
    if (!res.ok) return { countryCode: null as string | null, org: null as string | null }
    const data = await res.json() as { country_code?: string; org?: string }
    return {
      countryCode: data.country_code ? String(data.country_code).toUpperCase() : null,
      org: data.org ? String(data.org).toLowerCase() : null,
    }
  } catch {
    return { countryCode: null as string | null, org: null as string | null }
  }
}

export function shouldCloakInvisibleCheckout(input: {
  ip?: string | null
  userAgent?: string | null
  allowedCountries?: string[]
  countryCode?: string | null
  org?: string | null
  blockedOrgKeywords?: string[]
}) {
  const ip = parseIp(input.ip)
  const userAgent = String(input.userAgent ?? '')
  const blockedByUa = /(bot|crawler|spider|headless|curl|wget|python-requests|selenium|playwright)/i.test(userAgent)
  if (blockedByUa) {
    return { blocked: true, reason: 'BOT_USER_AGENT', countryCode: null as string | null }
  }
  if (!ip) {
    return { blocked: true, reason: 'IP_MISSING', countryCode: null as string | null }
  }
  if (/^(10\.|127\.|0\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/.test(ip)) {
    return { blocked: true, reason: 'PRIVATE_OR_RESERVED_IP', countryCode: null as string | null }
  }
  if (input.countryCode && (input.allowedCountries?.length ?? 0) > 0) {
    const allowed = (input.allowedCountries ?? []).map((item) => item.toUpperCase())
    if (!allowed.includes(input.countryCode.toUpperCase())) {
      return { blocked: true, reason: `COUNTRY_BLOCKED:${input.countryCode}`, countryCode: input.countryCode }
    }
  }
  if (input.org) {
    const keywords = (input.blockedOrgKeywords ?? DEFAULT_BLOCKED_ORG_KEYWORDS).map((item) => item.toLowerCase())
    if (keywords.some((keyword) => input.org?.includes(keyword))) {
      return { blocked: true, reason: 'DATACENTER_OR_PROXY_OR_VPN', countryCode: input.countryCode ?? null }
    }
  }
  return { blocked: false, reason: null, countryCode: input.countryCode ?? null }
}

export async function trackInvisibleCheckoutProbe(input: {
  token: string
  reason: string
  checkoutId?: string | null
  listingId?: string | null
  ip?: string | null
  userAgent?: string | null
  countryCode?: string | null
  details?: Record<string, unknown>
}) {
  const sanitizedExtra = input.details
    ? (JSON.parse(JSON.stringify(input.details)) as Prisma.InputJsonValue)
    : null
  await prisma.auditLog.create({
    data: {
      action: 'QUICK_SALE_SPY_ATTEMPT',
      entity: 'InvisibleCheckoutToken',
      entityId: input.token,
      userId: null,
      details: {
        token: input.token,
        reason: input.reason,
        checkoutId: input.checkoutId ?? null,
        listingId: input.listingId ?? null,
        ip: parseIp(input.ip),
        userAgent: String(input.userAgent ?? '').slice(0, 300) || null,
        countryCode: input.countryCode ?? null,
        extra: sanitizedExtra,
      },
    },
  }).catch(() => {})
}

export async function getInvisibleCheckoutPayloadForCheckout(checkoutId: string) {
  const checkout = await prisma.quickSaleCheckout.findUnique({
    where: { id: checkoutId },
    select: {
      id: true,
      listing: {
        select: { id: true, slug: true },
      },
      status: true,
    },
  }).catch(() => null)
  if (!checkout) return null
  if (checkout.status === 'PAID' || checkout.status === 'CANCELLED' || checkout.status === 'EXPIRED') {
    return null
  }
  const modeSetting = await prisma.systemSetting.findUnique({
    where: { key: listingPaymentModeKey(checkout.listing.id) },
    select: { value: true },
  }).catch(() => null)
  const mode = parseQuickSalePaymentMode(modeSetting?.value) === 'GLOBAL' ? 'GLOBAL' : 'PIX'
  const access = await createInvisibleCheckoutLink({
    checkoutId: checkout.id,
    listingSlug: checkout.listing.slug,
    mode,
    ttlMinutes: DEFAULT_TTL_MINUTES,
    maxUses: 1,
    closeOnPaid: true,
    source: ISSUE_SOURCE.API_LOJA_PIX,
  }).catch(() => null)
  if (!access) return null
  return {
    token: access.token,
    secureCheckoutUrl: access.secureUrl,
    legacyCheckoutUrl: access.legacyUrl,
    expiresAt: access.expiresAt,
  }
}

export function getInvisibleCheckoutIp(headers: Headers) {
  return firstForwardedIp(headers)
}

export async function getInvisibleCheckoutDecoyUrl() {
  const settings = await getInvisiblePolicySettings()
  return settings.decoyUrl
}

export async function getInvisibleCheckoutPolicy() {
  return getInvisiblePolicySettings()
}
