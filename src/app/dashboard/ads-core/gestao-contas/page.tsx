import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { AdsManagementProviders } from '@/components/dashboard/ads-management/AdsManagementProviders'
import { AdsManagementDashboard } from '@/components/dashboard/ads-management/AdsManagementDashboard'

export default async function GestaoContasAdsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login?callbackUrl=/dashboard/ads-core/gestao-contas')

  const role = session.user.role
  if (!['ADMIN', 'PRODUCTION_MANAGER'].includes(role || '')) {
    redirect('/dashboard/ads-core')
  }

  return (
    <AdsManagementProviders>
      <AdsManagementDashboard />
    </AdsManagementProviders>
  )
}
