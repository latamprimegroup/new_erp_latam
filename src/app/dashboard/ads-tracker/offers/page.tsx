import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { OffersClient } from './OffersClient'

export default async function TrackerOffersPage() {
  const session = await getServerSession(authOptions)
  const role = session?.user?.role
  const canWrite = role === 'ADMIN' || role === 'MANAGER' || role === 'PRODUCTION_MANAGER'

  return (
    <div className="space-y-4 text-zinc-100">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Cofre de ofertas (S2S)</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Módulo 05 — postbacks servidor-a-servidor, link de checkout no teu domínio (`/pay/…`) e fila de conversões
          offline. Cumpre as políticas do Google Ads: não use isto para esconder dados de revisão ou para contornar
          requisitos de transparência.
        </p>
      </div>
      <OffersClient canWrite={canWrite} />
    </div>
  )
}
