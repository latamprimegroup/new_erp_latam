import type { AdsTrackerCampaign } from '@prisma/client'
import type { AdsTrackerEdgeAction, AdsTrackerEdgePayload } from './edge-webhook'

export function buildEdgePayload(
  c: Pick<AdsTrackerCampaign, 'id' | 'name' | 'domainHost' | 'landingUrl' | 'uniId'>,
  action: AdsTrackerEdgeAction
): AdsTrackerEdgePayload {
  return {
    version: 1,
    action,
    campaignId: c.id,
    campaignName: c.name,
    domainHost: c.domainHost,
    landingUrl: c.landingUrl,
    uniId: c.uniId,
    at: new Date().toISOString(),
  }
}
