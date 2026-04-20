import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { PlugPlayTrackerClient } from './PlugPlayTrackerClient'

const ROLES = ['ADMIN', 'DELIVERER', 'COMMERCIAL', 'PRODUCER', 'PRODUCTION_MANAGER']

export default async function PlugPlayTrackerPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (!session.user?.role || !ROLES.includes(session.user.role)) redirect('/dashboard')

  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-1">Delivery Tracker — Plug & Play</h1>
      <p className="text-sm text-zinc-500 mb-8">
        Transparência entre vendas, produção e cliente: progresso por lote, gargalos e notas operacionais.
      </p>
      <PlugPlayTrackerClient />
    </div>
  )
}
