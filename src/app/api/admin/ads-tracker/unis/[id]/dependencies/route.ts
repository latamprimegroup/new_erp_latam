import { NextResponse } from 'next/server'
import { TrackerOfferStatus } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { landingUrlToHost } from '@/lib/ads-tracker/urls'

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const uni = await prisma.vaultIndustrialUnit.findUnique({ where: { id } })
  if (!uni) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const campaigns = await prisma.adsTrackerCampaign.findMany({
    where: { uniId: id },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  })

  const hosts = new Set(campaigns.map((c) => c.domainHost).filter(Boolean))

  const vaultRows = await prisma.trackerLandingVault.findMany({
    take: 500,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      primaryUrl: true,
      secondaryUrl: true,
      status: true,
    },
  })

  const matchedLandings: {
    id: string
    name: string
    primaryUrl: string
    secondaryUrl: string | null
    status: string
    matchedHost: string
  }[] = []

  for (const v of vaultRows) {
    const p = landingUrlToHost(v.primaryUrl)
    const primaryHost = p.ok ? p.host : null
    if (primaryHost && hosts.has(primaryHost)) {
      matchedLandings.push({ ...v, matchedHost: primaryHost })
      continue
    }
    if (v.secondaryUrl) {
      const s = landingUrlToHost(v.secondaryUrl)
      const sh = s.ok ? s.host : null
      if (sh && hosts.has(sh)) {
        matchedLandings.push({ ...v, matchedHost: sh })
      }
    }
  }

  const offers = await prisma.trackerOffer.findMany({
    where: { status: { not: TrackerOfferStatus.ARCHIVED } },
    take: 100,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, platform: true, paySlug: true, status: true },
  })

  return NextResponse.json({
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      domainHost: c.domainHost,
      landingUrl: c.landingUrl,
      status: c.status,
      emergencyContingency: c.emergencyContingency,
      updatedAt: c.updatedAt.toISOString(),
    })),
    landings: matchedLandings,
    offersNote:
      'Ofertas S2S são globais ao tracker (sem uni_id). Liste abaixo apenas para contexto operacional — não há vínculo direto no modelo.',
    offersGlobal: offers,
  })
}
