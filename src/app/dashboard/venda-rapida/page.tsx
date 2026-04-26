import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { VendaRapidaTab } from '@/app/dashboard/compras/VendaRapidaTab'

const ALLOWED = ['ADMIN', 'CEO', 'COMMERCIAL']

export default async function VendaRapidaPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role)) {
    redirect('/dashboard')
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="heading-1">Venda Rápida PIX</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-3xl">
          Crie links de checkout, gere PIX integrado e envie no WhatsApp sem depender da área de Compras.
        </p>
      </div>
      <VendaRapidaTab defaultPaymentMode="PIX" listingModeFilter="PIX" showSecurityPanel={false} />
    </div>
  )
}
