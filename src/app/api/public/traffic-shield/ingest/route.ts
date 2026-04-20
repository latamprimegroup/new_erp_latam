import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseDeviceAndBrowser } from '@/lib/traffic-shield/user-agent-hints'

export const runtime = 'nodejs'

const VERDICTS = new Set(['ALLOWED', 'BLOCKED'])
const SHIELD_PROFILES = new Set(['SAFE', 'MONEY', 'UNKNOWN'])

function strOpt(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t) return null
  return t.slice(0, max)
}

function intOpt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.floor(v))
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n))
  }
  return null
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * POST — Ingestão de decisões do edge (um evento por pedido avaliado).
 * Header: X-Traffic-Shield-Ingest-Secret = TRAFFIC_SHIELD_INGEST_SECRET
 */
export async function POST(req: NextRequest) {
  const secret = process.env.TRAFFIC_SHIELD_INGEST_SECRET?.trim()
  if (!secret) {
    return NextResponse.json({ error: 'TRAFFIC_SHIELD_INGEST_SECRET não configurado' }, { status: 503 })
  }
  if (req.headers.get('x-traffic-shield-ingest-secret') !== secret) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const ip = typeof body.ip === 'string' ? body.ip.trim().slice(0, 45) : ''
  if (!ip) {
    return NextResponse.json({ error: 'ip obrigatório' }, { status: 400 })
  }

  const verdict = typeof body.verdict === 'string' ? body.verdict.toUpperCase() : ''
  if (!VERDICTS.has(verdict)) {
    return NextResponse.json({ error: 'verdict deve ser ALLOWED ou BLOCKED' }, { status: 400 })
  }

  const userAgentRaw = strOpt(body.userAgent, 600)
  const gclidStr = strOpt(body.gclid, 512) ?? strOpt(body.gclidValue, 512)
  const gclidPresent = Boolean(body.gclidPresent) || Boolean(gclidStr)

  let shieldProfile = strOpt(body.shieldProfile, 16)?.toUpperCase() ?? null
  if (shieldProfile && !SHIELD_PROFILES.has(shieldProfile)) shieldProfile = null

  let deviceCategory = strOpt(body.deviceCategory, 24)?.toLowerCase() ?? null
  let browserFamily = strOpt(body.browserFamily, 64) ?? null
  if (userAgentRaw && (!deviceCategory || !browserFamily)) {
    const parsed = parseDeviceAndBrowser(userAgentRaw)
    if (!deviceCategory) deviceCategory = parsed.deviceCategory
    if (!browserFamily) browserFamily = parsed.browserFamily
  }

  const uniRaw = strOpt(body.uniId, 36) ?? strOpt(body.uni_id, 36)
  const uniId = uniRaw && UUID_RE.test(uniRaw) ? uniRaw : null

  const ispName =
    strOpt(body.ispName, 200) ?? strOpt(body.isp, 200) ?? strOpt(body.isp_name, 200)

  const row = await prisma.trafficShieldAccessLog.create({
    data: {
      ip,
      country: typeof body.country === 'string' ? body.country.trim().slice(0, 8) || null : null,
      region: typeof body.region === 'string' ? body.region.trim().slice(0, 80) || null : null,
      userAgent: userAgentRaw,
      referer: typeof body.referer === 'string' ? body.referer.trim().slice(0, 1200) || null : null,
      gclidPresent,
      gclid: gclidStr,
      utmCampaign: strOpt(body.utmCampaign, 512) ?? strOpt(body.utm_campaign, 512),
      utmContent: strOpt(body.utmContent, 512) ?? strOpt(body.utm_content, 512),
      shieldProfile,
      deviceCategory,
      browserFamily,
      ispName,
      sessionDurationMs: intOpt(body.sessionDurationMs ?? body.session_duration_ms),
      uniId,
      verdict,
      reason: typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) || null : null,
      asn: typeof body.asn === 'string' ? body.asn.replace(/\D/g, '').slice(0, 32) || null : null,
      contextKey: typeof body.contextKey === 'string' ? body.contextKey.trim().slice(0, 120) || null : null,
    },
  })

  return NextResponse.json({ ok: true, id: row.id })
}
