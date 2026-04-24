import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { CommercialManagerClient } from './CommercialManagerClient'
import { canManageCommercialTeam } from '@/lib/commercial-hierarchy'

export default async function CommercialManagerPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) redirect('/dashboard')
  if (!canManageCommercialTeam(session.user?.role, session.user?.cargo)) {
    redirect('/dashboard/commercial/seller')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading-1">Head of Sales — Gestão Comercial</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm mt-1 max-w-3xl">
          Visão de águia da operação comercial: performance por vendedor, auditoria de vendas, distribuição de
          leads estratégicos e fechamento de comissões com override gerencial.
        </p>
      </div>
      <CommercialManagerClient />
    </div>
  )
}
