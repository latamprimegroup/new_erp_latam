import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { VendaRapidaTab } from '@/app/dashboard/compras/VendaRapidaTab'

const ALLOWED = ['ADMIN', 'COMMERCIAL', 'CEO']

export default async function VendaRapidaGlobalPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role)) {
    redirect('/dashboard')
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="heading-1">Venda Rápida Global</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-3xl">
          Gere links globais com gateways Kast/Mercury e acompanhe o fluxo internacional sem misturar com PIX.
        </p>
      </div>
      <VendaRapidaTab
        defaultPaymentMode="GLOBAL"
        listingModeFilter="GLOBAL"
        showSecurityPanel={false}
        globalMode={true}
      />
    </div>
  )
}
