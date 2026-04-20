import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { S2SPostbackLogsClient } from './S2SPostbackLogsClient'

export default async function S2SPostbackLogsPage() {
  const session = await getServerSession(authOptions)
  const canReprocess = session?.user?.role !== 'FINANCE'

  return (
    <div className="space-y-4 text-zinc-100">
      <div>
        <h1 className="text-xl font-bold tracking-tight">S2S Postback — auditoria de conversão</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Módulo 10 — integridade entre checkout (Kiwify/Hotmart/etc.) e o tracker: GCLID, fila Google (M08), payload
          bruto e reenvio manual. A fila de casamento de 60s evita marcar órfão antes de um segundo postback trazer o
          click id.
        </p>
      </div>
      <S2SPostbackLogsClient canReprocess={canReprocess} />
    </div>
  )
}
