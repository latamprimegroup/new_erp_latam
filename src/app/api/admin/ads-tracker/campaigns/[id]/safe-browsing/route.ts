import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { checkUrlSafeBrowsing } from '@/lib/ads-tracker/safe-browsing'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  const { id } = await params
  const row = await prisma.adsTrackerCampaign.findUnique({ where: { id } })
  if (!row) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const r = await checkUrlSafeBrowsing(row.landingUrl)
  const now = new Date()
  let safeBrowsingStatus = 'ERROR'
  let safeBrowsingDetail: string | null = null
  if (r.status === 'OK') safeBrowsingStatus = 'OK'
  else if (r.status === 'WARNING') {
    safeBrowsingStatus = 'WARNING'
    safeBrowsingDetail = r.detail.slice(0, 500)
  } else if (r.status === 'SKIPPED') {
    safeBrowsingStatus = 'SKIPPED'
    safeBrowsingDetail = r.detail.slice(0, 500)
  } else {
    safeBrowsingDetail = r.detail.slice(0, 500)
  }

  await prisma.adsTrackerCampaign.update({
    where: { id },
    data: { safeBrowsingStatus, safeBrowsingDetail, safeBrowsingCheckedAt: now },
  })

  return NextResponse.json({ safeBrowsingStatus, safeBrowsingDetail, safeBrowsingCheckedAt: now.toISOString() })
}
