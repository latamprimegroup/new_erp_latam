import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { QuickSaleSecurityPanel } from '@/app/dashboard/compras/QuickSaleSecurityPanel'

const ALLOWED = ['ADMIN', 'COMMERCIAL']

export default async function SmartDeliverySystemPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role)) {
    redirect('/dashboard')
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="heading-1">SmartDeliverySystem (Visão CEO)</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-3xl">
          Painel dedicado de segurança, KYC, InvisibleCheckout, anti-fraude e parâmetros de proteção da operação.
        </p>
      </div>
      <QuickSaleSecurityPanel />
    </div>
  )
}
