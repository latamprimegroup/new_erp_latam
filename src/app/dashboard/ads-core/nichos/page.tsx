import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { AdsCoreNichosGestaoClient } from './AdsCoreNichosGestaoClient'

export default async function AdsCoreNichosPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login?callbackUrl=/dashboard/ads-core/nichos')

  const role = session.user.role
  if (role !== 'ADMIN' && role !== 'PRODUCTION_MANAGER') {
    redirect('/dashboard/ads-core')
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Link href="/dashboard/ads-core" className="text-sm text-primary-600 hover:underline">
          ← ADS CORE
        </Link>
      </div>
      <h1 className="heading-1 mb-2">Gestão por nicho</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 max-w-3xl">
        Segmentação de colaboradores por célula de mercado e congruência CNAE. Cada aba isola um nicho; os dados de
        Contabilidade não se misturam com Pizzaria na atribuição controlada.
      </p>
      <AdsCoreNichosGestaoClient />
    </div>
  )
}
