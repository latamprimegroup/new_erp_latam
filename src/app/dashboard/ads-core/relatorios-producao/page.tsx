import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { AdsCoreRelatoriosClient } from './AdsCoreRelatoriosClient'

export default async function AdsCoreRelatoriosPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login?callbackUrl=/dashboard/ads-core/relatorios-producao')

  const role = session.user.role
  if (role !== 'ADMIN' && role !== 'PRODUCTION_MANAGER') {
    redirect('/dashboard/ads-core')
  }

  return <AdsCoreRelatoriosClient />
}
