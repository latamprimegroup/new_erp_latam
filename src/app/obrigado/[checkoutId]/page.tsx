/**
 * /obrigado/[checkoutId]
 *
 * Página de Obrigado pós-pagamento com:
 *  - Confirmação visual do pedido
 *  - Upsell de produto complementar com timer de urgência (15 min)
 *  - Link de indicação com desconto para o amigo
 *  - CTA para o painel de entrega
 */
import { prisma } from '@/lib/prisma'
import { ObrigadoClient } from './ObrigadoClient'

export const dynamic = 'force-dynamic'

export default async function ObrigadoPage({ params }: { params: { checkoutId: string } }) {
  const checkout = await prisma.quickSaleCheckout.findUnique({
    where: { id: params.checkoutId },
    select: {
      id:          true,
      status:      true,
      buyerName:   true,
      totalAmount: true,
      qty:         true,
      warrantyEndsAt: true,
      listing: {
        select: {
          id:    true,
          slug:  true,
          title: true,
          badge: true,
          assetCategory: true,
        },
      },
    },
  }).catch(() => null)

  if (!checkout || checkout.status !== 'PAID') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-sm w-full text-center space-y-4">
          <p className="text-4xl">❓</p>
          <p className="text-white font-semibold">Pedido não encontrado ou ainda não confirmado.</p>
          <a href="/dashboard" className="text-emerald-400 text-sm hover:underline">Voltar ao painel</a>
        </div>
      </div>
    )
  }

  // Busca produto complementar (mesmo tipo, listing diferente e ativo)
  const upsellListing = await prisma.productListing.findFirst({
    where: {
      active:        true,
      id:            { not: checkout.listing.id },
      assetCategory: checkout.listing.assetCategory,
    },
    select: {
      id:          true,
      slug:        true,
      title:       true,
      pricePerUnit: true,
      badge:       true,
    },
    orderBy: { createdAt: 'desc' },
  }).catch(() => null)

  return (
    <ObrigadoClient
      checkout={{
        id:          checkout.id,
        buyerName:   checkout.buyerName,
        totalAmount: Number(checkout.totalAmount),
        qty:         checkout.qty,
        warrantyEndsAt: checkout.warrantyEndsAt?.toISOString() ?? null,
        listing: checkout.listing,
      }}
      upsellListing={upsellListing
        ? {
            id:         upsellListing.id,
            slug:       upsellListing.slug,
            title:      upsellListing.title,
            price:      Number(upsellListing.pricePerUnit),
            badge:      upsellListing.badge,
          }
        : null
      }
    />
  )
}
