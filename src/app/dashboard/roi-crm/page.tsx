import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { authOptions } from '@/lib/auth'
import { RoiCrmDashboardClient } from './RoiCrmDashboardClient'

export const metadata: Metadata = {
  title: 'ROI & CRM',
  description: 'Integração TinTim.app e vendas ERP — métricas de ROI, LTV e CRM.',
}

export default async function RoiCrmPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const roles = ['ADMIN', 'COMMERCIAL', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) redirect('/dashboard')

  const canManageSpend = session.user.role === 'ADMIN' || session.user.role === 'FINANCE'

  return (
    <RoiCrmDashboardClient
      userName={session.user.name || session.user.email || 'Usuário'}
      userRole={session.user.role}
      canManageSpend={canManageSpend}
    />
  )
}
