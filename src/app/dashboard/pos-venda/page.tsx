import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { PosVendaClient } from './PosVendaClient'

const ALLOWED = ['ADMIN', 'CEO', 'COMMERCIAL', 'DELIVERER']

export default async function PosVendaPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role)) {
    redirect('/dashboard')
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="heading-1">Central de Pós-Venda</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-3xl">
          Gerencie credenciais entregues, rastreie a origem dos ativos e registre logs de suporte para cada pedido aprovado.
        </p>
      </div>
      <PosVendaClient userRole={session.user.role} />
    </div>
  )
}
