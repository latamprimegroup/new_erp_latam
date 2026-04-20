import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { CommercialOxygenClient } from './CommercialOxygenClient'

export default async function CommercialOxygenPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) redirect('/dashboard')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading-1">Pulmão Comercial</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm mt-1 max-w-3xl">
          KPIs, checkout (confirmar / WhatsApp com log), cupons, rascunho de link de pagamento, CRM com repescagem 15d e
          ranking, estoque por plataforma, fila de solicitações, log de contatos e Telegram na solicitação do cliente +
          no PIX confirmado.
        </p>
      </div>
      <CommercialOxygenClient />
    </div>
  )
}
