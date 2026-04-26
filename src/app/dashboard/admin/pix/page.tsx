import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { TesourariaClient } from './TesourariaClient'

export const metadata = { title: 'Tesouraria Multimoeda — War Room OS' }

export default async function TesourariaPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!['ADMIN', 'CEO'].includes(role ?? '')) redirect('/dashboard')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="heading-1">💎 Tesouraria Multimoeda</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-3xl">
          Liquidez consolidada em tempo real — PIX Brasil, Mercury USD e Cripto Global. Projeção para R$ 10M/ano.
        </p>
      </div>
      <TesourariaClient />
    </div>
  )
}
