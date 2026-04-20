import { Prisma, type PrismaClient, TrackerSalePaymentState } from '@prisma/client'
import {
  extractAdsTrackerCampaignId,
  extractBuyerIdentity,
} from '@/lib/ads-tracker/offer-payload'

type Body = Record<string, unknown>

/**
 * Regista compra aprovada uma vez por sale signal (Módulo 14 — LTV por identidade).
 */
export async function recordLtvFromApprovedPostback(opts: {
  prisma: PrismaClient
  offerId: string
  saleSignalId: string
  body: Body
  paymentState: TrackerSalePaymentState
  amountGross: Prisma.Decimal
  currency: string
  platformOrderId: string | null
  countedForRevenue: boolean
}): Promise<void> {
  if (opts.paymentState !== TrackerSalePaymentState.APPROVED) return
  if (!opts.countedForRevenue) return
  if (opts.amountGross.lte(0)) return

  const identity = extractBuyerIdentity(opts.body)
  if (!identity) return

  const existingPurchase = await opts.prisma.trackerLeadLtvPurchase.findUnique({
    where: { saleSignalId: opts.saleSignalId },
  })
  if (existingPurchase) return

  const campaignId = extractAdsTrackerCampaignId(opts.body)

  await opts.prisma.$transaction(async (tx) => {
    await tx.trackerLeadLtvPurchase.create({
      data: {
        buyerIdentityHash: identity.hash,
        buyerHint: identity.hint.slice(0, 48),
        offerId: opts.offerId,
        platformOrderId: opts.platformOrderId,
        amountGross: opts.amountGross,
        currency: opts.currency.slice(0, 8),
        saleSignalId: opts.saleSignalId,
        attributedCampaignId: campaignId,
      },
    })

    const agg = await tx.trackerLeadLtvAggregate.findUnique({
      where: { buyerIdentityHash: identity.hash },
    })
    const now = new Date()
    if (agg) {
      await tx.trackerLeadLtvAggregate.update({
        where: { buyerIdentityHash: identity.hash },
        data: {
          totalGross: agg.totalGross.add(opts.amountGross),
          purchaseCount: { increment: 1 },
          lastPurchaseAt: now,
          attributedCampaignId: agg.attributedCampaignId ?? campaignId ?? undefined,
          attributedOfferId: agg.attributedOfferId ?? opts.offerId,
        },
      })
    } else {
      await tx.trackerLeadLtvAggregate.create({
        data: {
          buyerIdentityHash: identity.hash,
          buyerHint: identity.hint.slice(0, 48),
          currency: opts.currency.slice(0, 8),
          totalGross: opts.amountGross,
          purchaseCount: 1,
          attributedCampaignId: campaignId,
          attributedOfferId: opts.offerId,
          firstPurchaseAt: now,
          lastPurchaseAt: now,
        },
      })
    }
  })
}
