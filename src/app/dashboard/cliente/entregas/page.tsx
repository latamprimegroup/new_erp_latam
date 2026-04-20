import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { ClienteEntregasClient } from './ClienteEntregasClient'

export default async function ClienteEntregasPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user?.role !== 'CLIENT') redirect('/dashboard')

  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-1">Minhas entregas</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Acompanhe quantas contas já foram entregues em cada lote, em tempo real.
      </p>
      <ClienteEntregasClient />
    </div>
  )
}
