import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { probeLandingLatencyMs } from '@/lib/ads-tracker/probe-latency'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  const { id } = await params
  const row = await prisma.adsTrackerCampaign.findUnique({ where: { id } })
  if (!row) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const ms = await probeLandingLatencyMs(row.landingUrl)
  const now = new Date()
  await prisma.adsTrackerCampaign.update({
    where: { id },
    data: { lastLatencyMs: ms, lastLatencyCheckedAt: now },
  })

  return NextResponse.json({ lastLatencyMs: ms, lastLatencyCheckedAt: now.toISOString() })
}
