import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  auditStyleAlertFromUa,
  automationHintFromUserAgent,
  countryCodeToFlagEmoji,
  parseDeviceAndBrowser,
} from '@/lib/traffic-shield/user-agent-hints'

export type ParsedTrafficShieldLogsQuery = {
  where: Prisma.TrafficShieldAccessLogWhereInput
  take: number
  skip: number
  /** null = sem limite temporal (ex.: Módulo 03 com take apenas) */
  hours: number | null
}

export function parseTrafficShieldLogsQuery(searchParams: URLSearchParams): ParsedTrafficShieldLogsQuery {
  const take = Math.min(200, Math.max(1, Number(searchParams.get('take') || '50') || 50))
  const skip = Math.max(0, Number(searchParams.get('skip') || '0') || 0)

  const hoursRaw = searchParams.get('hours')
  const hours =
    hoursRaw === null || hoursRaw === ''
      ? null
      : Math.min(168, Math.max(1, Number(hoursRaw) || 72))

  const where: Prisma.TrafficShieldAccessLogWhereInput = {}
  if (hours !== null) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000)
    where.createdAt = { gte: since }
  }

  if (searchParams.get('gclid') === '1') {
    where.OR = [{ gclid: { not: null } }, { gclidPresent: true }]
  }
  if (searchParams.get('blocked') === '1') where.verdict = 'BLOCKED'

  const uniId = searchParams.get('uniId')?.trim()
  if (uniId) where.uniId = uniId

  const ipq = searchParams.get('ip')?.trim()
  if (ipq) {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ipq)) where.ip = ipq
    else where.ip = { contains: ipq.slice(0, 45) }
  }

  return { where, take, skip, hours }
}

/** IPs com ≥2 context_key distintos na janela — sinal de fraude de clique ou varredura. */
export async function trafficShieldFraudIpSet(hoursWindow = 6): Promise<Set<string>> {
  const since = new Date(Date.now() - hoursWindow * 60 * 60 * 1000)
  const rows = await prisma.$queryRaw<Array<{ ip: string }>>(
    Prisma.sql`
      SELECT ip FROM traffic_shield_access_logs
      WHERE created_at >= ${since}
        AND context_key IS NOT NULL AND TRIM(context_key) <> ''
      GROUP BY ip
      HAVING COUNT(DISTINCT context_key) >= 2
    `
  )
  return new Set(rows.map((r) => r.ip))
}

type LogRowCore = {
  id: string
  ip: string
  country: string | null
  region: string | null
  userAgent: string | null
  referer: string | null
  gclidPresent: boolean
  gclid: string | null
  utmCampaign: string | null
  utmContent: string | null
  verdict: string
  reason: string | null
  asn: string | null
  ispName: string | null
  contextKey: string | null
  shieldProfile: string | null
  deviceCategory: string | null
  browserFamily: string | null
  sessionDurationMs: number | null
  uniId: string | null
  createdAt: Date
}

export function trafficShieldLogToDto(r: LogRowCore, fraudIps: Set<string>) {
  const automationHint = automationHintFromUserAgent(r.userAgent)
  const auditStyleAlert = auditStyleAlertFromUa(r.userAgent)
  const parsed = parseDeviceAndBrowser(r.userAgent)
  return {
    id: r.id,
    ip: r.ip,
    country: r.country,
    region: r.region,
    countryFlag: countryCodeToFlagEmoji(r.country),
    userAgent: r.userAgent,
    referer: r.referer,
    gclidPresent: r.gclidPresent,
    gclid: r.gclid,
    utmCampaign: r.utmCampaign,
    utmContent: r.utmContent,
    verdict: r.verdict,
    reason: r.reason,
    asn: r.asn,
    ispName: r.ispName,
    contextKey: r.contextKey,
    shieldProfile: r.shieldProfile,
    deviceCategory: r.deviceCategory ?? parsed.deviceCategory,
    browserFamily: r.browserFamily ?? parsed.browserFamily,
    sessionDurationMs: r.sessionDurationMs,
    uniId: r.uniId,
    createdAt: r.createdAt.toISOString(),
    fraudSuspect: fraudIps.has(r.ip),
    automationHint,
    auditStyleAlert,
  }
}
