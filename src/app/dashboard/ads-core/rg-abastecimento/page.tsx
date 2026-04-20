import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { AdsCoreRgAbastecimentoClient } from './AdsCoreRgAbastecimentoClient'

export default async function AdsCoreRgAbastecimentoPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login?callbackUrl=/dashboard/ads-core/rg-abastecimento')

  const role = session.user.role
  if (role !== 'ADMIN' && role !== 'PRODUCTION_MANAGER') {
    redirect('/dashboard/ads-core')
  }

  return <AdsCoreRgAbastecimentoClient />
}
