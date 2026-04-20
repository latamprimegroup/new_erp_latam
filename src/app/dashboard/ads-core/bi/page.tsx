import dynamic from 'next/dynamic'
import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import Link from 'next/link'

const AdsCoreBiClient = dynamic(() => import('./AdsCoreBiClient'), {
  loading: () => <p className="text-gray-500">Carregando BI…</p>,
  ssr: false,
})

export default async function AdsCoreBiPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login?callbackUrl=/dashboard/ads-core/bi')

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
      <h1 className="heading-1 mb-1">Dashboard de gestão ADS CORE</h1>
      <p className="text-xs font-semibold text-primary-600 dark:text-primary-400 mb-2">
        Cérebro operacional — visão do gerente
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 max-w-3xl">
        Pipeline por nicho (em aberto, em verificação G2, aprovadas), anti-idle para equilibrar carga, ranking de
        produtores e alerta de nichos com alta reprovação.
      </p>
      <AdsCoreBiClient />
    </div>
  )
}
