import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { EcosystemClient } from './EcosystemClient'

export default async function EcosystemPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user?.role !== 'CLIENT') redirect('/dashboard')

  return (
    <div>
      <h1 className="text-xl font-bold text-zinc-100 mb-1">Infraestrutura de Guerra</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Ecossistema Ads Ativos: contas, landers, tracking, proxies e ferramentas num só painel.
      </p>
      <EcosystemClient />
    </div>
  )
}
