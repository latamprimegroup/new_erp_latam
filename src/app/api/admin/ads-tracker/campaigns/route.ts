import { NextResponse } from 'next/server'
import { AdsTrackerCampaignStatus } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { maskCnpj, maskEmail } from '@/lib/gatekeeper/masking'
import { landingUrlToHost, proxyHostKeyFromParts } from '@/lib/ads-tracker/urls'
import { findCampaignDomainClashForUni } from '@/lib/ads-tracker/uni-domain-exclusivity'
import { checkUrlSafeBrowsing } from '@/lib/ads-tracker/safe-browsing'
import { buildShareMaps, contaminationHints, gclidAttributionHint } from '@/lib/ads-tracker/contamination'

function sbFieldsFromResult(r: Awaited<ReturnType<typeof checkUrlSafeBrowsing>>): {
  safeBrowsingStatus: string
  safeBrowsingDetail: string | null
} {
  if (r.status === 'OK') return { safeBrowsingStatus: 'OK', safeBrowsingDetail: null }
  if (r.status === 'WARNING') return { safeBrowsingStatus: 'WARNING', safeBrowsingDetail: r.detail.slice(0, 500) }
  if (r.status === 'SKIPPED') return { safeBrowsingStatus: 'SKIPPED', safeBrowsingDetail: r.detail.slice(0, 500) }
  return { safeBrowsingStatus: 'ERROR', safeBrowsingDetail: r.detail.slice(0, 500) }
}

/**
 * GET — Lista campanhas com agregados de isolamento (partilha de domínio/proxy).
 */
export async function GET(req: Request) {
  const auth = await requireRoles(['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const includeArchived = searchParams.get('includeArchived') === '1'

  const where = includeArchived ? {} : { status: { not: AdsTrackerCampaignStatus.ARCHIVED } }

  const rows = await prisma.adsTrackerCampaign.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 200,
    include: {
      uni: {
        include: {
          inventoryGmail: { select: { email: true } },
          inventoryCnpj: { select: { cnpj: true } },
        },
      },
    },
  })

  const allForMaps = await prisma.adsTrackerCampaign.findMany({
    select: { domainHost: true, proxyHostKey: true, status: true },
  })
  const maps = buildShareMaps(allForMaps)

  const campaigns = rows.map((c) => {
    const contam = contaminationHints({
      domainHost: c.domainHost,
      proxyHostKey: c.proxyHostKey,
      maps,
    })
    const gclidHint = gclidAttributionHint({
      gclidTrackingRequired: c.gclidTrackingRequired,
      clickTotal: c.clickTotal,
      gclidCaptured: c.gclidCaptured,
    })
    const latencyRisk = c.lastLatencyMs != null && c.lastLatencyMs > 500

    let health: 'ok' | 'warn' | 'bad' = 'ok'
    if (c.emergencyContingency || c.safeBrowsingStatus === 'WARNING') health = 'bad'
    else if (
      contam.length > 0 ||
      latencyRisk ||
      c.safeBrowsingStatus === 'ERROR' ||
      Boolean(gclidHint)
    ) {
      health = 'warn'
    }

    return {
      id: c.id,
      name: c.name,
      landingUrl: c.landingUrl,
      domainHost: c.domainHost,
      proxyHostKey: c.proxyHostKey,
      uniId: c.uniId,
      uniLabel: `${maskEmail(c.uni.inventoryGmail.email)} · ${maskCnpj(c.uni.inventoryCnpj.cnpj)}`,
      adsPowerProfileId: c.uni.adsPowerProfileId,
      gclidTrackingRequired: c.gclidTrackingRequired,
      status: c.status,
      emergencyContingency: c.emergencyContingency,
      clickTotal: c.clickTotal,
      gclidCaptured: c.gclidCaptured,
      lastLatencyMs: c.lastLatencyMs,
      lastLatencyCheckedAt: c.lastLatencyCheckedAt?.toISOString() ?? null,
      safeBrowsingStatus: c.safeBrowsingStatus,
      safeBrowsingDetail: c.safeBrowsingDetail,
      safeBrowsingCheckedAt: c.safeBrowsingCheckedAt?.toISOString() ?? null,
      edgeWebhookOverrideUrl: c.edgeWebhookOverrideUrl,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      contaminationHints: contam,
      gclidHint,
      health,
    }
  })

  return NextResponse.json({ campaigns })
}

/**
 * POST — Cria campanha (vínculo UNI + landing).
 */
export async function POST(req: Request) {
  const auth = await requireRoles(['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  let body: {
    name?: string
    uniId?: string
    landingUrl?: string
    gclidTrackingRequired?: boolean
    edgeWebhookOverrideUrl?: string | null
    clickTotal?: number
    gclidCaptured?: number
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 300) : ''
  const uniId = typeof body.uniId === 'string' ? body.uniId.trim() : ''
  const landingUrl = typeof body.landingUrl === 'string' ? body.landingUrl.trim().slice(0, 2000) : ''
  if (!name || !uniId || !landingUrl) {
    return NextResponse.json({ error: 'name, uniId e landingUrl são obrigatórios' }, { status: 400 })
  }

  const hostParsed = landingUrlToHost(landingUrl)
  if (!hostParsed.ok) {
    return NextResponse.json({ error: hostParsed.error }, { status: 400 })
  }

  const uni = await prisma.vaultIndustrialUnit.findUnique({
    where: { id: uniId },
    include: { matchedProxy: { select: { proxyHost: true, proxyPort: true } } },
  })
  if (!uni) {
    return NextResponse.json({ error: 'UNI não encontrada' }, { status: 404 })
  }
  if (uni.killedAt) {
    return NextResponse.json({ error: 'UNI em kill-switch — não é possível criar campanha.' }, { status: 409 })
  }

  const clash = await findCampaignDomainClashForUni(prisma, hostParsed.host, uniId)
  if (clash) {
    return NextResponse.json(
      {
        error:
          'Este domínio de landing já está vinculado a outra UNI (anti-footprint). Use outro host ou arquive a campanha existente.',
        clashCampaignId: clash.campaignId,
        otherUniId: clash.otherUniId,
      },
      { status: 409 }
    )
  }

  const proxyHostKey = proxyHostKeyFromParts(uni.matchedProxy?.proxyHost, uni.matchedProxy?.proxyPort)

  const sb = await checkUrlSafeBrowsing(landingUrl)
  const sbFields = sbFieldsFromResult(sb)
  const nowSb = new Date()

  const edgeWebhookOverrideUrl =
    typeof body.edgeWebhookOverrideUrl === 'string'
      ? body.edgeWebhookOverrideUrl.trim().slice(0, 800) || null
      : null

  const clickTotal = typeof body.clickTotal === 'number' && body.clickTotal >= 0 ? Math.floor(body.clickTotal) : 0
  const gclidCaptured =
    typeof body.gclidCaptured === 'number' && body.gclidCaptured >= 0 ? Math.floor(body.gclidCaptured) : 0

  const row = await prisma.adsTrackerCampaign.create({
    data: {
      name,
      uniId,
      landingUrl,
      domainHost: hostParsed.host,
      proxyHostKey,
      gclidTrackingRequired: Boolean(body.gclidTrackingRequired),
      edgeWebhookOverrideUrl,
      clickTotal,
      gclidCaptured,
      safeBrowsingStatus: sbFields.safeBrowsingStatus,
      safeBrowsingDetail: sbFields.safeBrowsingDetail,
      safeBrowsingCheckedAt: nowSb,
    },
  })

  return NextResponse.json({ id: row.id })
}
