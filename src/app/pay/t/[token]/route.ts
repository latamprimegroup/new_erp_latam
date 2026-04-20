import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleTrackerPayRedirect, logPayMiss } from '@/lib/ads-tracker/checkout-pay-redirect'
import { TrackerCheckoutInitiationOutcome } from '@prisma/client'

/**
 * Checkout com token efémero (/pay/t/...) — TTL e limite de usos.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token || token.length > 32) {
    return logPayMiss(req, TrackerCheckoutInitiationOutcome.OFFER_NOT_FOUND, token || '-', null)
  }

  try {
    const access = await prisma.$transaction(async (tx) => {
      const row = await tx.trackerCheckoutAccessToken.findUnique({
        where: { token },
        include: { offer: { include: { checkoutSettings: true } } },
      })
      if (!row) return { kind: 'missing' as const }
      if (row.expiresAt.getTime() < Date.now()) return { kind: 'expired' as const, offerId: row.offerId }
      if (row.useCount >= row.maxUses) return { kind: 'exhausted' as const, offerId: row.offerId }
      await tx.trackerCheckoutAccessToken.update({
        where: { id: row.id },
        data: { useCount: { increment: 1 } },
      })
      return { kind: 'ok' as const, offer: row.offer }
    })

    if (access.kind === 'missing') {
      return logPayMiss(req, TrackerCheckoutInitiationOutcome.OFFER_NOT_FOUND, token, null)
    }
    if (access.kind === 'expired') {
      return logPayMiss(req, TrackerCheckoutInitiationOutcome.TOKEN_EXPIRED, token, access.offerId)
    }
    if (access.kind === 'exhausted') {
      return logPayMiss(req, TrackerCheckoutInitiationOutcome.TOKEN_EXHAUSTED, token, access.offerId)
    }

    return handleTrackerPayRedirect(req, {
      offer: access.offer,
      payLabel: `t:${token}`,
      viaEphemeral: true,
    })
  } catch {
    return logPayMiss(req, TrackerCheckoutInitiationOutcome.OFFER_NOT_FOUND, token, null)
  }
}
