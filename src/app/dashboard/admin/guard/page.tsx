import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { GuardClient } from './GuardClient'

export default async function AdminGuardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user?.role !== 'ADMIN') redirect('/dashboard')

  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-1">Ads Ativos Guard</h1>
      <p className="text-sm text-zinc-500 mb-8">
        Compliance scanner: blacklist, IA e (opcional) Vision em VSL. Semáforo de risco antes de publicar.
      </p>
      <GuardClient />
    </div>
  )
}
