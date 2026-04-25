import type { Metadata } from 'next'
import { LojaGlobalClient } from './LojaGlobalClient'

interface Props {
  params: { slug: string }
  searchParams: Record<string, string | string[] | undefined>
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Checkout Global — Ads Ativos',
    description: 'Compra global via Kast ou Mercury',
    robots: 'noindex',
  }
}

export default function LojaGlobalPage({ params, searchParams }: Props) {
  const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src'] as const
  const utms = Object.fromEntries(
    utmKeys.map((k) => [k, typeof searchParams[k] === 'string' ? searchParams[k] : undefined]),
  ) as Record<string, string | undefined>
  const initialCheckoutId =
    typeof searchParams.checkoutId === 'string' ? searchParams.checkoutId : undefined
  const sellerRef =
    typeof searchParams.ref === 'string' ? searchParams.ref : undefined

  return (
    <LojaGlobalClient
      slug={params.slug}
      urlUtms={utms}
      checkoutId={initialCheckoutId}
      sellerRef={sellerRef}
    />
  )
}
