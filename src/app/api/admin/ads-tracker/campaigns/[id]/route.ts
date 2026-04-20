import { NextResponse } from 'next/server'
import { AdsTrackerCampaignStatus } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { landingUrlToHost } from '@/lib/ads-tracker/urls'
import { findCampaignDomainClashForUni } from '@/lib/ads-tracker/uni-domain-exclusivity'
import { checkUrlSafeBrowsing } from '@/lib/ads-tracker/safe-browsing'
import { notifyAdsTrackerEdge } from '@/lib/ads-tracker/edge-webhook'
import { buildEdgePayload } from '@/lib/ads-tracker/edge-payload'

function sbFieldsFromResult(r: Awaited<ReturnType<typeof checkUrlSafeBrowsing>>): {
  safeBrowsingStatus: string
  safeBrowsingDetail: string | null
} {
  if (r.status === 'OK') return { safeBrowsingStatus: 'OK', safeBrowsingDetail: null }
  if (r.status === 'WARNING') return { safeBrowsingStatus: 'WARNING', safeBrowsingDetail: r.detail.slice(0, 500) }
  if (r.status === 'SKIPPED') return { safeBrowsingStatus: 'SKIPPED', safeBrowsingDetail: r.detail.slice(0, 500) }
  return { safeBrowsingStatus: 'ERROR', safeBrowsingDetail: r.detail.slice(0, 500) }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  const { id } = await params
  const row = await prisma.adsTrackerCampaign.findUnique({ where: { id } })
  if (!row) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ campaign: row })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  const { id } = await params
  const prev = await prisma.adsTrackerCampaign.findUnique({ where: { id } })
  if (!prev) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}

  if (typeof body.name === 'string') {
    const n = body.name.trim().slice(0, 300)
    if (n) data.name = n
  }
  if (typeof body.landingUrl === 'string') {
    const u = body.landingUrl.trim().slice(0, 2000)
    const h = landingUrlToHost(u)
    if (!h.ok) return NextResponse.json({ error: h.error }, { status: 400 })
    const clash = await findCampaignDomainClashForUni(prisma, h.host, prev.uniId, prev.id)
    if (clash) {
      return NextResponse.json(
        {
          error:
            'Este domínio de landing já está vinculado a outra UNI (anti-footprint).',
          clashCampaignId: clash.campaignId,
          otherUniId: clash.otherUniId,
        },
        { status: 409 }
      )
    }
    data.landingUrl = u
    data.domainHost = h.host
  }
  if (typeof body.gclidTrackingRequired === 'boolean') data.gclidTrackingRequired = body.gclidTrackingRequired
  if (typeof body.clickTotal === 'number' && body.clickTotal >= 0) data.clickTotal = Math.floor(body.clickTotal)
  if (typeof body.gclidCaptured === 'number' && body.gclidCaptured >= 0) {
    data.gclidCaptured = Math.floor(body.gclidCaptured)
  }
  if (body.edgeWebhookOverrideUrl === null) data.edgeWebhookOverrideUrl = null
  else if (typeof body.edgeWebhookOverrideUrl === 'string') {
    data.edgeWebhookOverrideUrl = body.edgeWebhookOverrideUrl.trim().slice(0, 800) || null
  }
  if (typeof body.status === 'string') {
    const s = body.status as AdsTrackerCampaignStatus
    if (Object.values(AdsTrackerCampaignStatus).includes(s)) data.status = s
  }
  if (typeof body.emergencyContingency === 'boolean') data.emergencyContingency = body.emergencyContingency
  if (body.recheckSafeBrowsing === true) {
    const url = (data.landingUrl as string) || prev.landingUrl
    const sb = await checkUrlSafeBrowsing(url)
    const f = sbFieldsFromResult(sb)
    data.safeBrowsingStatus = f.safeBrowsingStatus
    data.safeBrowsingDetail = f.safeBrowsingDetail
    data.safeBrowsingCheckedAt = new Date()
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Sem alterações' }, { status: 400 })
  }

  const next = await prisma.adsTrackerCampaign.update({
    where: { id },
    data: data as object,
  })

  const webhookUrl = next.edgeWebhookOverrideUrl
  let sentResume = false
  const sendResume = async () => {
    if (sentResume) return
    sentResume = true
    await notifyAdsTrackerEdge({
      overrideUrl: webhookUrl,
      payload: buildEdgePayload(next, 'resume_route'),
    })
  }

  if (prev.status === AdsTrackerCampaignStatus.ACTIVE && next.status === AdsTrackerCampaignStatus.PAUSED) {
    await notifyAdsTrackerEdge({
      overrideUrl: webhookUrl,
      payload: buildEdgePayload(next, 'pause_route'),
    })
  }

  if (prev.status !== AdsTrackerCampaignStatus.ARCHIVED && next.status === AdsTrackerCampaignStatus.ARCHIVED) {
    await notifyAdsTrackerEdge({
      overrideUrl: webhookUrl,
      payload: buildEdgePayload(next, 'delete_route'),
    })
  }

  if (
    prev.status === AdsTrackerCampaignStatus.PAUSED &&
    next.status === AdsTrackerCampaignStatus.ACTIVE &&
    !next.emergencyContingency
  ) {
    await sendResume()
  }

  if (!prev.emergencyContingency && next.emergencyContingency) {
    await notifyAdsTrackerEdge({
      overrideUrl: webhookUrl,
      payload: buildEdgePayload(next, 'emergency_contingency'),
    })
  }

  if (prev.emergencyContingency && !next.emergencyContingency) {
    await sendResume()
  }

  return NextResponse.json({ ok: true })
}
