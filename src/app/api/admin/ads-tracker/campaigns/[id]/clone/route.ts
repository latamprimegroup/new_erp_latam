import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  const { id } = await params
  const src = await prisma.adsTrackerCampaign.findUnique({ where: { id } })
  if (!src) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const name = `${src.name.slice(0, 280)} (cópia)`

  const row = await prisma.adsTrackerCampaign.create({
    data: {
      name,
      uniId: src.uniId,
      landingUrl: src.landingUrl,
      domainHost: src.domainHost,
      proxyHostKey: src.proxyHostKey,
      gclidTrackingRequired: src.gclidTrackingRequired,
      edgeWebhookOverrideUrl: src.edgeWebhookOverrideUrl,
      clickTotal: 0,
      gclidCaptured: 0,
      safeBrowsingStatus: src.safeBrowsingStatus,
      safeBrowsingDetail: src.safeBrowsingDetail,
      safeBrowsingCheckedAt: src.safeBrowsingCheckedAt,
    },
  })

  return NextResponse.json({ id: row.id })
}
