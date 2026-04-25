import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import {
  getMinValueForKycBrl,
  getQuickSaleAntiFraudCounter,
  getQuickSaleUtmifyToken,
  getSuspiciousEmailDomains,
  setMinValueForKycBrl,
  setSuspiciousEmailDomains,
  setQuickSaleUtmifyToken,
  SMART_DELIVERY_KEYS,
  SMART_DELIVERY_DEFAULTS,
  upsertQuickSaleAdspowerGroupMap,
} from '@/lib/smart-delivery-system'
import {
  getInvisibleCheckoutTtlMinutes,
  INVISIBLE_LINK_EXPIRATION_MAX_MINUTES,
  INVISIBLE_LINK_EXPIRATION_MIN_MINUTES,
  setInvisibleCheckoutTtlMinutes,
} from '@/lib/invisible-checkout'

type SecurityPayload = {
  minValueForKycBrl: number
  linkExpirationTime: number
  linkExpirationMin: number
  linkExpirationMax: number
  sharingWindow: '24h' | '7d' | '30d'
  suspiciousEmailDomains: string[]
  antiFraudBlocks: number
  linkSharingAttempts: number
  recentLinkSharingAttempts: Array<{
    id: string
    createdAt: string
    token: string | null
    checkoutId: string | null
    listingId: string | null
    ip: string | null
    originalIp: string | null
    sharingAttemptIp: string | null
    userAgent: string | null
  }>
  pendingKycCount: number
  adspowerGroupMap: Record<string, string>
  utmifyTokenPreview: string | null
}

type SharingWindow = '24h' | '7d' | '30d'

const DEFAULT_SHARING_WINDOW: SharingWindow = '24h'
const DEFAULT_SHARING_LIMIT = 50
const MAX_SHARING_LIMIT = 500

function parseSharingWindow(raw: string | null | undefined): SharingWindow {
  const normalized = String(raw ?? '').trim().toLowerCase()
  if (normalized === '24h' || normalized === '7d' || normalized === '30d') {
    return normalized
  }
  return DEFAULT_SHARING_WINDOW
}

function parseSharingLimit(raw: string | null | undefined) {
  const parsed = Number.parseInt(String(raw ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SHARING_LIMIT
  return Math.max(1, Math.min(MAX_SHARING_LIMIT, parsed))
}

function sharingWindowSince(window: SharingWindow) {
  const hours = window === '24h' ? 24 : window === '7d' ? 24 * 7 : 24 * 30
  return new Date(Date.now() - hours * 60 * 60 * 1000)
}

function maskToken(token: string | null) {
  if (!token) return null
  const trimmed = token.trim()
  if (!trimmed) return null
  if (trimmed.length <= 8) return '********'
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`
}

function readString(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const normalized = input.trim()
  return normalized || null
}

function parseLinkSharingDetails(raw: unknown) {
  if (!raw || typeof raw !== 'object') {
    return {
      token: null,
      checkoutId: null,
      listingId: null,
      ip: null,
      originalIp: null,
      userAgent: null,
    }
  }

  const details = raw as Record<string, unknown>
  const extra = details.extra && typeof details.extra === 'object'
    ? details.extra as Record<string, unknown>
    : null

  return {
    token: readString(details.token),
    checkoutId: readString(details.checkoutId),
    listingId: readString(details.listingId),
    ip: readString(details.ip),
    originalIp: readString(extra?.originalIp),
      sharingAttemptIp: readString(extra?.sharingAttemptIp),
    userAgent: readString(details.userAgent),
  }
}

async function buildSecurityPayload(options?: {
  sharingWindow?: SharingWindow
  sharingLimit?: number
}): Promise<SecurityPayload> {
  const sharingWindow = options?.sharingWindow ?? DEFAULT_SHARING_WINDOW
  const sharingLimit = Math.max(1, Math.min(MAX_SHARING_LIMIT, Number(options?.sharingLimit ?? DEFAULT_SHARING_LIMIT)))
  const since = sharingWindowSince(sharingWindow)
  const [minValueForKycBrl, linkExpirationTime, suspiciousEmailDomains, antiFraudBlocks, linkSharingAttempts, recentLinkSharingAttempts, pendingKycCount, mapSetting, utmifyToken] = await Promise.all([
    getMinValueForKycBrl(),
    getInvisibleCheckoutTtlMinutes(),
    getSuspiciousEmailDomains(),
    getQuickSaleAntiFraudCounter(),
    prisma.auditLog.count({
      where: {
        action: 'QUICK_SALE_LINK_SHARING_ATTEMPT',
        createdAt: { gte: since },
      },
    }).catch(() => 0),
    prisma.auditLog.findMany({
      where: {
        action: 'QUICK_SALE_LINK_SHARING_ATTEMPT',
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: sharingLimit,
      select: {
        id: true,
        createdAt: true,
        details: true,
      },
    }).catch(() => []),
    prisma.quickSaleCheckout.count({
      where: {
        status: 'PAID',
        deliveryFlowStatus: 'PENDING_KYC',
      },
    }).catch(() => 0),
    prisma.systemSetting.findUnique({
      where: { key: SMART_DELIVERY_KEYS.fallbackAdspowerGroupMap },
      select: { value: true },
    }).catch(() => null),
    getQuickSaleUtmifyToken(),
  ])

  let adspowerGroupMap: Record<string, string> = {}
  try {
    adspowerGroupMap = mapSetting?.value ? JSON.parse(mapSetting.value) as Record<string, string> : {}
  } catch {
    adspowerGroupMap = {}
  }

  return {
    minValueForKycBrl,
    linkExpirationTime,
    linkExpirationMin: INVISIBLE_LINK_EXPIRATION_MIN_MINUTES,
    linkExpirationMax: INVISIBLE_LINK_EXPIRATION_MAX_MINUTES,
    sharingWindow,
    suspiciousEmailDomains,
    antiFraudBlocks,
    linkSharingAttempts,
    recentLinkSharingAttempts: recentLinkSharingAttempts.map((attempt) => {
      const parsed = parseLinkSharingDetails(attempt.details)
      return {
        id: attempt.id,
        createdAt: attempt.createdAt.toISOString(),
        token: parsed.token,
        checkoutId: parsed.checkoutId,
        listingId: parsed.listingId,
        ip: parsed.ip,
        originalIp: parsed.originalIp,
        sharingAttemptIp: parsed.sharingAttemptIp ?? null,
        userAgent: parsed.userAgent,
      }
    }),
    pendingKycCount,
    adspowerGroupMap,
    utmifyTokenPreview: maskToken(utmifyToken ?? process.env.UTMIFY_API_TOKEN ?? SMART_DELIVERY_DEFAULTS.utmifyToken),
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'COMMERCIAL'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const sharingWindow = parseSharingWindow(searchParams.get('period'))
  const sharingLimit = parseSharingLimit(searchParams.get('limit'))
  const payload = await buildSecurityPayload({ sharingWindow, sharingLimit })
  return NextResponse.json(payload)
}

export async function PATCH(req: NextRequest) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const input = body as {
    minValueForKycBrl?: number
    linkExpirationTime?: number
    suspiciousEmailDomains?: string[]
    adspowerGroupMap?: Record<string, string>
    utmifyToken?: string | null
  }

  if (typeof input.minValueForKycBrl === 'number') {
    await setMinValueForKycBrl(input.minValueForKycBrl)
  }
  if (typeof input.linkExpirationTime === 'number') {
    await setInvisibleCheckoutTtlMinutes(input.linkExpirationTime)
  }
  if (Array.isArray(input.suspiciousEmailDomains)) {
    await setSuspiciousEmailDomains(input.suspiciousEmailDomains)
  }
  if (input.adspowerGroupMap && typeof input.adspowerGroupMap === 'object') {
    await upsertQuickSaleAdspowerGroupMap(input.adspowerGroupMap)
  }
  if (typeof input.utmifyToken === 'string' || input.utmifyToken === null) {
    await setQuickSaleUtmifyToken(input.utmifyToken)
  }

  await prisma.auditLog.create({
    data: {
      action: 'QUICK_SALE_SECURITY_SETTINGS_UPDATED',
      entity: 'SystemSetting',
      entityId: SMART_DELIVERY_KEYS.minValueForKyc,
      userId: auth.session.user.id,
      details: {
        minValueForKycBrl: input.minValueForKycBrl ?? null,
        linkExpirationTime: input.linkExpirationTime ?? null,
        suspiciousEmailDomainsCount: Array.isArray(input.suspiciousEmailDomains)
          ? input.suspiciousEmailDomains.length
          : null,
        adspowerGroupMapCount: input.adspowerGroupMap ? Object.keys(input.adspowerGroupMap).length : null,
        utmifyTokenUpdated: typeof input.utmifyToken === 'string' || input.utmifyToken === null,
      },
    },
  }).catch(() => {})

  const payload = await buildSecurityPayload()
  return NextResponse.json(payload)
}
