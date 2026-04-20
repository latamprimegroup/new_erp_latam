import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { appendUniActivityLog } from '@/lib/ads-tracker/uni-activity-log'
import { notifyAdsTrackerEdge } from '@/lib/ads-tracker/edge-webhook'
import { buildEdgePayload } from '@/lib/ads-tracker/edge-payload'

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const

/** POST — Kill-switch: desativa proxy no pool + contingência nas campanhas + webhook edge. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  let reason = 'Kill-switch manual (Módulo 11)'
  try {
    const body = (await req.json()) as { reason?: string }
    if (typeof body.reason === 'string' && body.reason.trim()) {
      reason = body.reason.trim().slice(0, 500)
    }
  } catch {
    /* body opcional */
  }

  const u = await prisma.vaultIndustrialUnit.findUnique({
    where: { id },
    include: { matchedProxy: { select: { id: true } } },
  })
  if (!u) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  if (u.killedAt) {
    return NextResponse.json({ error: 'UNI já está em kill-switch' }, { status: 409 })
  }

  const now = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.vaultIndustrialUnit.update({
      where: { id },
      data: { killedAt: now, killedReason: reason },
    })
    if (u.matchedProxyId) {
      await tx.geoProxyPoolEntry.update({
        where: { id: u.matchedProxyId },
        data: { active: false },
      })
    }
  })

  const campaigns = await prisma.adsTrackerCampaign.findMany({
    where: { uniId: id },
  })

  let webhooks = 0
  for (const c of campaigns) {
    const next = await prisma.adsTrackerCampaign.update({
      where: { id: c.id },
      data: { emergencyContingency: true },
    })
    const r = await notifyAdsTrackerEdge({
      overrideUrl: next.edgeWebhookOverrideUrl,
      payload: buildEdgePayload(next, 'emergency_contingency'),
    })
    if (!r.skipped) webhooks++
  }

  await appendUniActivityLog(prisma, id, 'kill', `Kill-switch: ${reason}`)

  return NextResponse.json({
    ok: true,
    campaignsAffected: campaigns.length,
    edgeNotificationsAttempted: webhooks,
  })
}
