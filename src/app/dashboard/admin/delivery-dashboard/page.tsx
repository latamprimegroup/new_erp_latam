import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { DeliveryDashboardClient } from './DeliveryDashboardClient'

export default async function DeliveryDashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const roles = ['ADMIN', 'DELIVERER', 'COMMERCIAL']
  if (!session.user?.role || !roles.includes(session.user.role)) redirect('/dashboard')
  return <DeliveryDashboardClient />
}
