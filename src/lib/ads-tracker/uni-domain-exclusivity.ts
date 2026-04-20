import { AdsTrackerCampaignStatus, type PrismaClient } from '@prisma/client'

/**
 * O mesmo host de landing não pode estar ativo em duas UNIs (anti-footprint).
 */
export async function findCampaignDomainClashForUni(
  prisma: PrismaClient,
  domainHost: string,
  uniId: string,
  excludeCampaignId?: string | null
): Promise<{ campaignId: string; otherUniId: string } | null> {
  const row = await prisma.adsTrackerCampaign.findFirst({
    where: {
      domainHost,
      uniId: { not: uniId },
      status: { not: AdsTrackerCampaignStatus.ARCHIVED },
      ...(excludeCampaignId ? { NOT: { id: excludeCampaignId } } : {}),
    },
    select: { id: true, uniId: true },
  })
  if (!row) return null
  return { campaignId: row.id, otherUniId: row.uniId }
}
