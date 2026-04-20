import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { AdsCoreDashboardClient } from './AdsCoreDashboardClient'

export default async function AdsCorePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login?callbackUrl=/dashboard/ads-core')

  const role = session.user.role
  if (!['ADMIN', 'PRODUCTION_MANAGER', 'PRODUCER'].includes(role || '')) {
    redirect('/dashboard')
  }

  return <AdsCoreDashboardClient role={role} />
}
