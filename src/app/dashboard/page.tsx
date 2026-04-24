import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { ExecutiveDashboard } from './ExecutiveDashboard'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (session?.user?.role === 'CLIENT') redirect('/dashboard/cliente')
  if (session?.user?.role === 'MANAGER') redirect('/dashboard/gestor')
  if (session?.user?.role === 'PLUG_PLAY') redirect('/dashboard/plugplay')
  if (session?.user?.role === 'PRODUCTION_MANAGER') redirect('/dashboard/gerente-producao')
  const cargoUpper = (session?.user?.cargo || '').toUpperCase()
  if (session?.user?.role === 'COMMERCIAL') {
    if (['GERENTE', 'GERENTE_COMERCIAL', 'HEAD_SALES', 'HEAD_OF_SALES', 'MANAGER'].includes(cargoUpper)) {
      redirect('/dashboard/commercial/manager')
    }
    redirect('/dashboard/commercial/seller')
  }

  const isAdmin = session?.user?.role === 'ADMIN'
  const userName = session?.user?.name || session?.user?.email || 'Usuário'
  const userRole = session?.user?.role ?? ''

  return (
    <ExecutiveDashboard userName={userName} isAdmin={isAdmin} userRole={userRole} />
  )
}
