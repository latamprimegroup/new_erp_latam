import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleTrackerPayRedirect, logPayMiss } from '@/lib/ads-tracker/checkout-pay-redirect'
import { TrackerCheckoutInitiationOutcome } from '@prisma/client'

/**
 * Link de checkout no domínio da app: redireciona (302) para o gateway com túnel de parâmetros.
 * Regista iniciações (Módulo 06). Sem iframe de checkout (ToS / políticas).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!slug || slug.length > 80) {
    return logPayMiss(req, TrackerCheckoutInitiationOutcome.OFFER_NOT_FOUND, slug || '-', null)
  }

  const offer = await prisma.trackerOffer.findFirst({
    where: { paySlug: slug },
    include: { checkoutSettings: true },
  })
  if (!offer) {
    return logPayMiss(req, TrackerCheckoutInitiationOutcome.OFFER_NOT_FOUND, slug, null)
  }

  return handleTrackerPayRedirect(req, { offer, payLabel: slug, viaEphemeral: false })
}
