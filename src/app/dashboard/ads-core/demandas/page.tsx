import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { AdsCoreDemandasClient } from '../AdsCoreDemandasClient'

export default async function AdsCoreDemandasPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login?callbackUrl=/dashboard/ads-core/demandas')

  const role = session.user.role
  if (role !== 'ADMIN' && role !== 'PRODUCTION_MANAGER') {
    redirect('/dashboard/ads-core')
  }

  return <AdsCoreDemandasClient />
}
