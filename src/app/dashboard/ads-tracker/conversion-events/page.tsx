import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { ConversionEventsClient } from './ConversionEventsClient'

export default async function ConversionEventsPage() {
  const session = await getServerSession(authOptions)
  const role = session?.user?.role
  const canWrite = role === 'ADMIN' || role === 'MANAGER' || role === 'PRODUCTION_MANAGER'

  return (
    <div className="space-y-4 text-zinc-100">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Eventos de conversão</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Módulo 08 — filtra sinais S2S (compras aprovadas, upsell) e fila envios offline para o Google Ads. O atraso
          configurável serve para reconciliação e antifraude, não para simular utilizador. Conversão preditiva e tempo na
          página: campos reservados até haver ingestão adequada.
        </p>
      </div>
      <ConversionEventsClient canWrite={canWrite} />
    </div>
  )
}
