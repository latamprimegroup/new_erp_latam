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

type SecurityPayload = {
  minValueForKycBrl: number
  suspiciousEmailDomains: string[]
  antiFraudBlocks: number
  pendingKycCount: number
  adspowerGroupMap: Record<string, string>
  utmifyTokenPreview: string | null
}

function maskToken(token: string | null) {
  if (!token) return null
  const trimmed = token.trim()
  if (!trimmed) return null
  if (trimmed.length <= 8) return '********'
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`
}

async function buildSecurityPayload(): Promise<SecurityPayload> {
  const [minValueForKycBrl, suspiciousEmailDomains, antiFraudBlocks, pendingKycCount, mapSetting, utmifyToken] = await Promise.all([
    getMinValueForKycBrl(),
    getSuspiciousEmailDomains(),
    getQuickSaleAntiFraudCounter(),
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
    suspiciousEmailDomains,
    antiFraudBlocks,
    pendingKycCount,
    adspowerGroupMap,
    utmifyTokenPreview: maskToken(utmifyToken ?? process.env.UTMIFY_API_TOKEN ?? SMART_DELIVERY_DEFAULTS.utmifyToken),
  }
}

export async function GET() {
  const auth = await requireRoles(['ADMIN', 'COMMERCIAL'])
  if (!auth.ok) return auth.response

  const payload = await buildSecurityPayload()
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
    suspiciousEmailDomains?: string[]
    adspowerGroupMap?: Record<string, string>
    utmifyToken?: string | null
  }

  if (typeof input.minValueForKycBrl === 'number') {
    await setMinValueForKycBrl(input.minValueForKycBrl)
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
