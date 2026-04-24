import type { Metadata } from 'next'
import { LojaClient }  from './LojaClient'

interface Props {
  params:      { slug: string }
  searchParams: Record<string, string | string[] | undefined>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return {
    title:       'Checkout — Ads Ativos',
    description: 'Compra segura via PIX com entrega automática',
    robots:      'noindex',
  }
}

export default function LojaPage({ params, searchParams }: Props) {
  const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src'] as const
  const utms = Object.fromEntries(
    utmKeys.map((k) => [k, typeof searchParams[k] === 'string' ? searchParams[k] : undefined]),
  ) as Record<string, string | undefined>
  const initialCheckoutId =
    typeof searchParams.checkoutId === 'string' ? searchParams.checkoutId : undefined

  return <LojaClient slug={params.slug} urlUtms={utms} checkoutId={initialCheckoutId} />
}
