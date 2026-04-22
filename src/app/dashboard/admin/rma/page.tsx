import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import RmaAdminClient from './RmaAdminClient'

export const metadata = { title: 'Suporte & RMA — ADS Ativos ERP' }

export default async function RmaAdminPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const allowed = ['ADMIN', 'PRODUCTION_MANAGER', 'COMMERCIAL', 'DELIVERER']
  if (!session.user?.role || !allowed.includes(session.user.role)) {
    redirect('/dashboard')
  }

  return <RmaAdminClient />
}
