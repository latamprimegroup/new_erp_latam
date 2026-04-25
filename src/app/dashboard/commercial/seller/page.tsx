import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { CommercialSellerClient } from './CommercialSellerClient'

export default async function CommercialSellerPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) {
    redirect('/dashboard')
  }
  if (!session.user?.id) {
    redirect('/dashboard')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading-1">Mesa do Vendedor</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm mt-1 max-w-3xl">
          Menu comercial rápido com vitrine pronta para consulta, lançamento da venda via PIX + WhatsApp e acompanhamento
          dos últimos checkouts gerados no fechamento.
        </p>
      </div>
      <CommercialSellerClient
        sellerId={session.user.id}
        sellerName={session.user.name ?? session.user.email ?? 'vendedor'}
      />
    </div>
  )
}
