import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { TrafficSourcesClient } from './TrafficSourcesClient'

export default async function TrafficSourcesPage() {
  const session = await getServerSession(authOptions)
  const role = session?.user?.role
  const canWrite = role === 'ADMIN' || role === 'MANAGER' || role === 'PRODUCTION_MANAGER'

  return (
    <div className="space-y-4 text-zinc-100">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Fontes de tráfego</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Módulo 07 — dicionário de parâmetros e gerador de URLs para campanhas (Google Ads e outras redes). A
          classificação orgânico/direto na pré-visualização baseia-se na querystring; abandono de carrinho S2S depende de
          webhooks do gateway (evolução futura ligada às ofertas).
        </p>
      </div>
      <TrafficSourcesClient canWrite={canWrite} />
    </div>
  )
}
