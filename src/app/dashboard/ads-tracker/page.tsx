import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { AdsTrackerCommandCenterClient } from './AdsTrackerCommandCenterClient'

export default async function AdsTrackerPage() {
  const session = await getServerSession(authOptions)
  if (session?.user?.role === 'FINANCE') {
    redirect('/dashboard/ads-tracker/finance')
  }
  return (
    <div className="space-y-4 text-zinc-100">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Ads Ativos Tracker</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Módulo 01 — Central de Campanhas · isolamento operacional, métricas de borda e gatilhos para o seu servidor
          (webhook).
        </p>
      </div>
      <AdsTrackerCommandCenterClient />
    </div>
  )
}
