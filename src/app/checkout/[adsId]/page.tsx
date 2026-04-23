import { notFound } from 'next/navigation'
import { prisma }   from '@/lib/prisma'
import CheckoutClient from './CheckoutClient'

interface Props {
  params:      { adsId: string }
  searchParams: Record<string, string | undefined>
}

export default async function CheckoutPage({ params, searchParams }: Props) {
  const adsId = decodeURIComponent(params.adsId)

  const asset = await prisma.asset.findFirst({
    where:  { adsId, status: 'AVAILABLE' },
    select: {
      adsId:       true,
      displayName: true,
      salePrice:   true,
      description: true,
      tags:        true,
      specs:       true,
    },
  })

  if (!asset || !asset.salePrice) notFound()

  const utms = {
    utm_source:   searchParams.utm_source,
    utm_medium:   searchParams.utm_medium,
    utm_campaign: searchParams.utm_campaign,
    utm_content:  searchParams.utm_content,
    utm_term:     searchParams.utm_term,
  }

  return (
    <CheckoutClient
      asset={{
        adsId:       asset.adsId,
        displayName: asset.displayName ?? asset.adsId,
        salePrice:   Number(asset.salePrice),
        description: asset.description ?? '',
        tags:        asset.tags ?? '',
        specs:       (asset.specs as Record<string, unknown>) ?? {},
      }}
      utms={utms}
    />
  )
}
