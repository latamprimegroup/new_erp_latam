import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { getLocalApiBase } from '@/lib/multilogin-adapter'
import { QUICK_SALE_LEGAL_TERMS_TEXT } from '@/lib/quick-sale-legal-terms'

export const SMART_DELIVERY_KEYS = {
  minValueForKyc: 'quick_sale_min_value_for_kyc_brl',
  suspiciousEmailDomains: 'quick_sale_suspicious_email_domains',
  fallbackAdspowerGroupMap: 'quick_sale_adspower_group_map',
  antiFraudCounter: 'quick_sale_antifraud_blocks_counter',
  utmifyToken: 'quick_sale_utmify_token',
  acceptedLegalTermsPrefix: 'quick_sale_accepted_legal_terms:',
} as const

export const SMART_DELIVERY_DEFAULTS = {
  minValueForKycBrl: 300,
  utmifyToken: 'KapTbUfIp64fDUgQW4xH27aiMqBYTvbKmXaB',
  suspiciousEmailDomains: [
    'mailinator.com',
    'tempmail.com',
    '10minutemail.com',
    'guerrillamail.com',
    'yopmail.com',
  ],
} as const

export type QuickSaleRiskReason =
  | 'AMOUNT_ABOVE_KYC'
  | 'SUSPICIOUS_EMAIL_DOMAIN'
  | 'BLACKLISTED_IDENTITY'

export type QuickSaleRiskDecision = {
  requiresKyc: boolean
  reasons: QuickSaleRiskReason[]
  minValueForKyc: number
}

export type QuickSaleGlobalBlacklistHit = {
  blocked: boolean
  normalizedEmail: string | null
  normalizedDocument: string | null
}

function normalizeEmail(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized || null
}

function normalizeDocument(value: string | null | undefined) {
  const normalized = String(value ?? '').replace(/\D/g, '')
  return normalized || null
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function quickSaleAcceptedLegalTermsKey(checkoutId: string) {
  return `${SMART_DELIVERY_KEYS.acceptedLegalTermsPrefix}${checkoutId}`
}

function parseMoney(value: string | null | undefined, fallback: number) {
  const parsed = Number(String(value ?? '').replace(',', '.').trim())
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

function parseCsvList(value: string | null | undefined) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

async function getSystemSetting(key: string) {
  const setting = await prisma.systemSetting.findUnique({
    where: { key },
    select: { value: true },
  }).catch(() => null)
  return setting?.value ?? null
}

export async function getMinValueForKycBrl() {
  const raw = await getSystemSetting(SMART_DELIVERY_KEYS.minValueForKyc)
  return parseMoney(raw, SMART_DELIVERY_DEFAULTS.minValueForKycBrl)
}

export async function setMinValueForKycBrl(nextValue: number) {
  const safe = Number.isFinite(nextValue) && nextValue > 0
    ? Math.round(nextValue * 100) / 100
    : SMART_DELIVERY_DEFAULTS.minValueForKycBrl
  await prisma.systemSetting.upsert({
    where: { key: SMART_DELIVERY_KEYS.minValueForKyc },
    create: { key: SMART_DELIVERY_KEYS.minValueForKyc, value: String(safe) },
    update: { value: String(safe) },
  })
  return safe
}

export async function getSuspiciousEmailDomains() {
  const raw = await getSystemSetting(SMART_DELIVERY_KEYS.suspiciousEmailDomains)
  const parsed = parseCsvList(raw)
  if (parsed.length > 0) return parsed
  return [...SMART_DELIVERY_DEFAULTS.suspiciousEmailDomains]
}

export async function getQuickSaleUtmifyToken() {
  const raw = await getSystemSetting(SMART_DELIVERY_KEYS.utmifyToken)
  const trimmed = String(raw ?? '').trim()
  return trimmed || null
}

export async function setQuickSaleUtmifyToken(nextToken: string | null | undefined) {
  const normalized = String(nextToken ?? '').trim()
  await prisma.systemSetting.upsert({
    where: { key: SMART_DELIVERY_KEYS.utmifyToken },
    create: { key: SMART_DELIVERY_KEYS.utmifyToken, value: normalized },
    update: { value: normalized },
  })
  return normalized || null
}

export async function acceptQuickSaleLegalTerms(checkoutId: string, input: {
  buyerName: string
  buyerDocument: string
  buyerEmail?: string | null
  buyerWhatsapp?: string | null
  ip?: string | null
  userAgent?: string | null
}) {
  const key = `${SMART_DELIVERY_KEYS.acceptedLegalTermsPrefix}${checkoutId}`
  const payload = {
    checkoutId,
    acceptedAt: new Date().toISOString(),
    legalText: QUICK_SALE_LEGAL_TERMS_TEXT,
    buyerName: input.buyerName,
    buyerDocument: input.buyerDocument,
    buyerEmail: input.buyerEmail ?? null,
    buyerWhatsapp: input.buyerWhatsapp ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  }
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(payload) },
    update: { value: JSON.stringify(payload) },
  })
  return payload
}

export async function hasAcceptedQuickSaleLegalTerms(checkoutId: string) {
  const key = `${SMART_DELIVERY_KEYS.acceptedLegalTermsPrefix}${checkoutId}`
  const setting = await prisma.systemSetting.findUnique({
    where: { key },
    select: { value: true },
  }).catch(() => null)
  return Boolean(setting?.value)
}

export async function setSuspiciousEmailDomains(domains: string[]) {
  const normalized = domains
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)
  await prisma.systemSetting.upsert({
    where: { key: SMART_DELIVERY_KEYS.suspiciousEmailDomains },
    create: {
      key: SMART_DELIVERY_KEYS.suspiciousEmailDomains,
      value: normalized.join(','),
    },
    update: {
      value: normalized.join(','),
    },
  })
  return normalized
}

export async function getQuickSaleAntiFraudCounter() {
  const raw = await getSystemSetting(SMART_DELIVERY_KEYS.antiFraudCounter)
  const parsed = Number.parseInt(String(raw ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

export async function incrementQuickSaleAntiFraudCounter() {
  const current = await getQuickSaleAntiFraudCounter()
  const next = current + 1
  await prisma.systemSetting.upsert({
    where: { key: SMART_DELIVERY_KEYS.antiFraudCounter },
    create: { key: SMART_DELIVERY_KEYS.antiFraudCounter, value: String(next) },
    update: { value: String(next) },
  })
  return next
}

export async function checkQuickSaleGlobalBlacklist(input: {
  buyerEmail?: string | null
  buyerDocument?: string | null
}) {
  const normalizedEmail = normalizeEmail(input.buyerEmail)
  const normalizedDocument = normalizeDocument(input.buyerDocument)
  const keys: string[] = []
  if (normalizedEmail) keys.push(`quick_sale_blacklist:email:${sha256(normalizedEmail)}`)
  if (normalizedDocument) keys.push(`quick_sale_blacklist:doc:${sha256(normalizedDocument)}`)
  if (keys.length === 0) {
    return {
      blocked: false,
      normalizedEmail,
      normalizedDocument,
    } satisfies QuickSaleGlobalBlacklistHit
  }
  const hit = await prisma.systemSetting.findFirst({
    where: { key: { in: keys } },
    select: { key: true },
  }).catch(() => null)
  return {
    blocked: Boolean(hit),
    normalizedEmail,
    normalizedDocument,
  } satisfies QuickSaleGlobalBlacklistHit
}

export async function addToQuickSaleGlobalBlacklist(input: {
  buyerEmail?: string | null
  buyerDocument?: string | null
  reason: string
  source: string
}) {
  const normalizedEmail = normalizeEmail(input.buyerEmail)
  const normalizedDocument = normalizeDocument(input.buyerDocument)
  const details = JSON.stringify({
    reason: input.reason,
    source: input.source,
    createdAt: new Date().toISOString(),
  })

  if (normalizedEmail) {
    await prisma.systemSetting.upsert({
      where: { key: `quick_sale_blacklist:email:${sha256(normalizedEmail)}` },
      create: {
        key: `quick_sale_blacklist:email:${sha256(normalizedEmail)}`,
        value: details,
      },
      update: { value: details },
    })
  }
  if (normalizedDocument) {
    await prisma.systemSetting.upsert({
      where: { key: `quick_sale_blacklist:doc:${sha256(normalizedDocument)}` },
      create: {
        key: `quick_sale_blacklist:doc:${sha256(normalizedDocument)}`,
        value: details,
      },
      update: { value: details },
    })
  }
  return { normalizedEmail, normalizedDocument }
}

export async function evaluateQuickSaleRisk(input: {
  totalAmountBrl: number
  buyerEmail?: string | null
  buyerDocument?: string | null
}) {
  const minValueForKyc = await getMinValueForKycBrl()
  const suspiciousDomains = await getSuspiciousEmailDomains()
  const reasons: QuickSaleRiskReason[] = []

  if (Number(input.totalAmountBrl) >= minValueForKyc) {
    reasons.push('AMOUNT_ABOVE_KYC')
  }

  const normalizedEmail = normalizeEmail(input.buyerEmail)
  const domain = normalizedEmail?.split('@')[1] ?? null
  if (domain && suspiciousDomains.includes(domain)) {
    reasons.push('SUSPICIOUS_EMAIL_DOMAIN')
  }

  const blacklist = await checkQuickSaleGlobalBlacklist({
    buyerEmail: input.buyerEmail,
    buyerDocument: input.buyerDocument,
  })
  if (blacklist.blocked) {
    reasons.push('BLACKLISTED_IDENTITY')
  }

  return {
    requiresKyc: reasons.length > 0,
    reasons,
    minValueForKyc,
  } satisfies QuickSaleRiskDecision
}

export async function setQuickSaleKycMeta(checkoutId: string, meta: {
  riskReasons: QuickSaleRiskReason[]
  minValueForKyc: number
}) {
  await prisma.systemSetting.upsert({
    where: { key: `quick_sale_kyc_meta:${checkoutId}` },
    create: {
      key: `quick_sale_kyc_meta:${checkoutId}`,
      value: JSON.stringify(meta),
    },
    update: {
      value: JSON.stringify(meta),
    },
  })
}

export async function setQuickSaleLegalTermsAcceptance(checkoutId: string, input: {
  acceptedAt: string
  ipHash?: string | null
  userAgent?: string | null
}) {
  await prisma.systemSetting.upsert({
    where: { key: `${SMART_DELIVERY_KEYS.acceptedLegalTermsPrefix}${checkoutId}` },
    create: {
      key: `${SMART_DELIVERY_KEYS.acceptedLegalTermsPrefix}${checkoutId}`,
      value: JSON.stringify({
        acceptedAt: input.acceptedAt,
        ipHash: input.ipHash ?? null,
        userAgent: input.userAgent ?? null,
      }),
    },
    update: {
      value: JSON.stringify({
        acceptedAt: input.acceptedAt,
        ipHash: input.ipHash ?? null,
        userAgent: input.userAgent ?? null,
      }),
    },
  })
}

export async function getQuickSaleLegalTermsAcceptance(checkoutId: string) {
  const raw = await getSystemSetting(`${SMART_DELIVERY_KEYS.acceptedLegalTermsPrefix}${checkoutId}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as {
      acceptedAt?: string
      ipHash?: string | null
      userAgent?: string | null
    }
  } catch {
    return null
  }
}

export async function getQuickSaleKycMeta(checkoutId: string) {
  const raw = await getSystemSetting(`quick_sale_kyc_meta:${checkoutId}`)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as {
      riskReasons?: QuickSaleRiskReason[]
      minValueForKyc?: number
    }
    return {
      riskReasons: Array.isArray(parsed.riskReasons) ? parsed.riskReasons : [],
      minValueForKyc: Number(parsed.minValueForKyc ?? SMART_DELIVERY_DEFAULTS.minValueForKycBrl),
    }
  } catch {
    return null
  }
}

export async function setQuickSaleKycFileMeta(checkoutId: string, meta: {
  documentPath?: string | null
  selfiePath?: string | null
  mimeType?: string | null
  uploadedAt?: string
}) {
  await prisma.systemSetting.upsert({
    where: { key: `quick_sale_kyc_file:${checkoutId}` },
    create: {
      key: `quick_sale_kyc_file:${checkoutId}`,
      value: JSON.stringify({
        ...meta,
        uploadedAt: meta.uploadedAt ?? new Date().toISOString(),
      }),
    },
    update: {
      value: JSON.stringify({
        ...meta,
        uploadedAt: meta.uploadedAt ?? new Date().toISOString(),
      }),
    },
  })
}

export async function getQuickSaleKycFileMeta(checkoutId: string) {
  const raw = await getSystemSetting(`quick_sale_kyc_file:${checkoutId}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as {
      documentPath?: string | null
      selfiePath?: string | null
      mimeType?: string | null
      uploadedAt?: string
    }
  } catch {
    return null
  }
}

export async function setQuickSaleAdspowerProfileRef(checkoutId: string, ref: {
  profileId?: string | null
  groupId?: string | null
}) {
  await prisma.systemSetting.upsert({
    where: { key: `quick_sale_adspower_ref:${checkoutId}` },
    create: {
      key: `quick_sale_adspower_ref:${checkoutId}`,
      value: JSON.stringify({
        profileId: ref.profileId ?? null,
        groupId: ref.groupId ?? null,
      }),
    },
    update: {
      value: JSON.stringify({
        profileId: ref.profileId ?? null,
        groupId: ref.groupId ?? null,
      }),
    },
  })
}

export async function getQuickSaleAdspowerProfileRef(checkoutId: string) {
  const raw = await getSystemSetting(`quick_sale_adspower_ref:${checkoutId}`)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { profileId?: string | null; groupId?: string | null }
    return {
      profileId: parsed.profileId ?? null,
      groupId: parsed.groupId ?? null,
    }
  } catch {
    return null
  }
}

export async function upsertQuickSaleAdspowerGroupMap(mapping: Record<string, string>) {
  await prisma.systemSetting.upsert({
    where: { key: SMART_DELIVERY_KEYS.fallbackAdspowerGroupMap },
    create: {
      key: SMART_DELIVERY_KEYS.fallbackAdspowerGroupMap,
      value: JSON.stringify(mapping),
    },
    update: {
      value: JSON.stringify(mapping),
    },
  })
  return mapping
}

export async function resolveQuickSaleAdspowerGroupId(productId: string) {
  const raw = await getSystemSetting(SMART_DELIVERY_KEYS.fallbackAdspowerGroupMap)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed[productId] ?? null
  } catch {
    return null
  }
}

function adspowerHeaders() {
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  const key = process.env.ADSPOWER_API_KEY?.trim()
  if (key) headers.Authorization = `Bearer ${key}`
  return headers
}

function isSuccessPayload(json: unknown) {
  if (!json || typeof json !== 'object') return false
  const code = (json as { code?: unknown }).code
  return code === 0 || code === '0' || code === undefined
}

export async function adspowerMoveProfile(input: {
  profileId: string
  targetGroupId: string
}) {
  const base = getLocalApiBase('ads_power').replace(/\/$/, '')
  const body = {
    user_ids: [input.profileId],
    group_id: input.targetGroupId,
  }
  const response = await fetch(`${base}/api/v1/user/update-group`, {
    method: 'POST',
    headers: adspowerHeaders(),
    body: JSON.stringify(body),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok || !isSuccessPayload(json)) {
    throw new Error((json as { msg?: string }).msg || `AdsPower move falhou (HTTP ${response.status})`)
  }
  return json
}

export async function adspowerDisableProfile(profileId: string) {
  const base = getLocalApiBase('ads_power').replace(/\/$/, '')
  const response = await fetch(`${base}/api/v1/user/update`, {
    method: 'POST',
    headers: adspowerHeaders(),
    body: JSON.stringify({
      user_id: profileId,
      status: 0,
    }),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok || !isSuccessPayload(json)) {
    throw new Error((json as { msg?: string }).msg || `AdsPower disable falhou (HTTP ${response.status})`)
  }
  return json
}

export async function sendFraudAlertToChatOps(input: {
  title: string
  severity?: 'INFO' | 'HIGH' | 'CRITICAL'
  details: Record<string, unknown>
}) {
  const webhooks = [
    process.env.FRAUD_ALERT_DISCORD_WEBHOOK?.trim(),
    process.env.FRAUD_ALERT_SLACK_WEBHOOK?.trim(),
  ].filter(Boolean) as string[]

  if (webhooks.length === 0) {
    return { sent: false, reason: 'NO_WEBHOOK' as const }
  }

  const severity = input.severity ?? 'HIGH'
  const markdownDetails = Object.entries(input.details)
    .map(([k, v]) => `- **${k}**: ${String(v)}`)
    .join('\n')
  const text = [
    `🚨 **${input.title}**`,
    `**Severidade:** ${severity}`,
    '',
    markdownDetails,
  ].join('\n')

  let sent = 0
  for (const url of webhooks) {
    try {
      const isDiscord = url.includes('discord.com/api/webhooks')
      const payload = isDiscord
        ? { content: text }
        : { text }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) sent += 1
    } catch {
      // best effort
    }
  }

  return { sent: sent > 0, webhookCount: webhooks.length, delivered: sent }
}

export async function tryAutoMoveQuickSaleAdspowerProfile(params: {
  checkoutId: string
  listingId: string
}) {
  const ref = await getQuickSaleAdspowerProfileRef(params.checkoutId).catch(() => null)
  if (!ref?.profileId) {
    return { moved: false as const, reason: 'NO_PROFILE_REF' as const }
  }
  const targetGroupId = ref.groupId || await resolveQuickSaleAdspowerGroupId(params.listingId)
  if (!targetGroupId) {
    return { moved: false as const, reason: 'NO_GROUP_MAP' as const, profileId: ref.profileId }
  }
  await adspowerMoveProfile({
    profileId: ref.profileId,
    targetGroupId,
  })
  return {
    moved: true as const,
    profileId: ref.profileId,
    targetGroupId,
  }
}

