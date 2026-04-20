import { AdsTrackerCampaignStatus, TrackerLandingVaultStatus, type PrismaClient } from '@prisma/client'

function hostFromUrl(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  try {
    const u = new URL(s.includes('://') ? s : `https://${s}`)
    return u.hostname.toLowerCase() || null
  } catch {
    return null
  }
}

/**
 * Domínios a monitorizar: campanhas não arquivadas + landings ativas (URLs primária/secundária).
 */
export async function collectActiveTrackerDomainHosts(prisma: PrismaClient): Promise<string[]> {
  const campaigns = await prisma.adsTrackerCampaign.findMany({
    where: { status: { not: AdsTrackerCampaignStatus.ARCHIVED } },
    select: { domainHost: true, landingUrl: true },
  })
  const landings = await prisma.trackerLandingVault.findMany({
    where: { status: TrackerLandingVaultStatus.ACTIVE },
    select: { primaryUrl: true, secondaryUrl: true },
  })

  const set = new Set<string>()
  for (const c of campaigns) {
    const h = c.domainHost?.trim().toLowerCase()
    if (h) set.add(h)
    const fromLanding = hostFromUrl(c.landingUrl)
    if (fromLanding) set.add(fromLanding)
  }
  for (const l of landings) {
    const p = hostFromUrl(l.primaryUrl)
    if (p) set.add(p)
    if (l.secondaryUrl) {
      const sec = hostFromUrl(l.secondaryUrl)
      if (sec) set.add(sec)
    }
  }
  return [...set].sort()
}
