import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { ComissaoRealtimeClient } from './ComissaoRealtimeClient'

export const metadata = { title: 'Comissão em Tempo Real — War Room OS' }

const ALLOWED = ['ADMIN', 'CEO', 'COMMERCIAL']

export default async function ComissaoPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!role || !ALLOWED.includes(role)) redirect('/dashboard')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="heading-1">💰 Comissão em Tempo Real</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
          Acompanhe suas vendas, comissão acumulada e meta do mês ao vivo.
        </p>
      </div>
      <ComissaoRealtimeClient />
    </div>
  )
}
