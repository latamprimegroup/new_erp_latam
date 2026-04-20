import { randomBytes } from 'node:crypto'
import { TrackerOfferPlatform, TrackerOfferStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'

function slugBaseFromLabel(label: string): string {
  const s = label
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 36)
  return s || 'shield'
}

async function uniquePaySlug(base: string): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const slug = `${base}-${randomBytes(2).toString('hex')}`
    const clash = await prisma.trackerOffer.findUnique({ where: { paySlug: slug } })
    if (!clash) return slug
  }
  return `shield-${randomBytes(8).toString('hex')}`
}

export async function createTrackerOfferForMentoradoShield(opts: {
  name: string
  checkoutTargetUrl: string
  platform: TrackerOfferPlatform
}): Promise<{ offerId: string; paySlug: string; postbackPublicToken: string }> {
  const postbackPublicToken = randomBytes(24).toString('hex')
  const webhookSecret = randomBytes(32).toString('hex')
  const paySlug = await uniquePaySlug(slugBaseFromLabel(opts.name))
  const row = await prisma.trackerOffer.create({
    data: {
      name: opts.name.trim().slice(0, 200),
      platform: opts.platform,
      status: TrackerOfferStatus.ACTIVE,
      postbackPublicToken,
      webhookSecret,
      clickIdField: 'auto',
      checkoutTargetUrl: opts.checkoutTargetUrl.trim().slice(0, 2000),
      paySlug,
      googleOfflineDelayMinutes: 120,
    },
  })
  return { offerId: row.id, paySlug: row.paySlug, postbackPublicToken: row.postbackPublicToken }
}
