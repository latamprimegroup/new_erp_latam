import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { notifyAdsTrackerEdge } from '@/lib/ads-tracker/edge-webhook'
import { buildEdgePayload } from '@/lib/ads-tracker/edge-payload'

/**
 * POST — Contingência imediata: ativa flag e notifica o webhook de borda (configurável).
 * O ERP não define o conteúdo servido no edge — apenas o evento.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  const { id } = await params
  const prev = await prisma.adsTrackerCampaign.findUnique({ where: { id } })
  if (!prev) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  if (prev.emergencyContingency) {
    return NextResponse.json({
      ok: true,
      alreadyActive: true,
      edge: { ok: true, skipped: true as const },
    })
  }

  const next = await prisma.adsTrackerCampaign.update({
    where: { id },
    data: { emergencyContingency: true },
  })

  const edge = await notifyAdsTrackerEdge({
    overrideUrl: next.edgeWebhookOverrideUrl,
    payload: buildEdgePayload(next, 'emergency_contingency'),
  })

  return NextResponse.json({
    ok: true,
    alreadyActive: false,
    edge,
  })
}
