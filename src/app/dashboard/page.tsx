import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { ExecutiveDashboard } from './ExecutiveDashboard'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (session?.user?.role === 'CLIENT') redirect('/dashboard/cliente')
  if (session?.user?.role === 'MANAGER') redirect('/dashboard/gestor')
  if (session?.user?.role === 'PLUG_PLAY') redirect('/dashboard/plugplay')

  const isAdmin = session?.user?.role === 'ADMIN'
  const userName = session?.user?.name || session?.user?.email || 'Usuário'
  const userRole = session?.user?.role ?? ''

  return (
    <ExecutiveDashboard userName={userName} isAdmin={isAdmin} userRole={userRole} />
  )
}
