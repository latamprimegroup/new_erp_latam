import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { MetasMensaisCard } from './MetasMensaisCard'
import { DashboardBento } from './DashboardBento'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (session?.user?.role === 'CLIENT') redirect('/dashboard/cliente')
  if (session?.user?.role === 'MANAGER') redirect('/dashboard/gestor')
  if (session?.user?.role === 'PLUG_PLAY') redirect('/dashboard/plugplay')

  const isAdmin = session?.user?.role === 'ADMIN'

  return (
    <div>
      <h1 className="text-xl font-bold text-zinc-900 dark:text-white mb-1">Dashboard Executivo</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Bem-vindo(a), <span className="font-medium text-gray-700 dark:text-gray-300">{session?.user?.name || session?.user?.email}</span>
        {' · '}Visão operacional em tempo real
      </p>

      <div className="mt-6 space-y-6">
        <DashboardBento />
        {isAdmin && <MetasMensaisCard isAdmin={isAdmin} />}
      </div>
    </div>
  )
}
