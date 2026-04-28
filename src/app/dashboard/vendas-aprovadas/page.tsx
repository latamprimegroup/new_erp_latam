import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { VendasAprovadasClient } from './VendasAprovadasClient'

export const metadata = { title: 'Vendas Aprovadas — War Room OS' }

const ALLOWED = ['ADMIN', 'CEO', 'COMMERCIAL', 'DELIVERER']

export default async function VendasAprovadasPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!role || !ALLOWED.includes(role)) redirect('/dashboard')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="heading-1">✅ Vendas Aprovadas</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-3xl">
          Pedidos pagos aguardando entrega — colete o e-mail AdsPower do cliente e gerencie o status de entrega.
        </p>
      </div>
      <VendasAprovadasClient userRole={role} />
    </div>
  )
}
