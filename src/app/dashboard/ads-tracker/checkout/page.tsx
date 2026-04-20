import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { CheckoutSettingsClient } from './CheckoutSettingsClient'

export default async function CheckoutSettingsPage() {
  const session = await getServerSession(authOptions)
  const role = session?.user?.role
  const canWrite = role === 'ADMIN' || role === 'MANAGER' || role === 'PRODUCTION_MANAGER'

  return (
    <div className="space-y-4 text-zinc-100">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Checkout — túnel de parâmetros</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Módulo 06 — continuidade de atribuição (gclid, UTMs, click_id) até ao gateway via redirecionamento no teu
          domínio. Não disponibilizamos iframe de checkout (conflito com ToS e políticas). Cumpre sempre as regras do
          Google Ads e do teu processador de pagamentos.
        </p>
      </div>
      <CheckoutSettingsClient canWrite={canWrite} />
    </div>
  )
}
