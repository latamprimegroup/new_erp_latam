import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { LandingFactoryClient } from './LandingFactoryClient'

export default async function LandingFactoryPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user?.role !== 'CLIENT') redirect('/dashboard')

  return (
    <div>
      <h1 className="text-xl font-bold text-zinc-900 dark:text-white mb-1">
        Fábrica de Landing Pages & Ads
      </h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        Crie seu site, configure tracking e campanhas em minutos
      </p>
      <LandingFactoryClient />
    </div>
  )
}
