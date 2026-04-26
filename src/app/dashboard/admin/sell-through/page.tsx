import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { SellThroughClient } from './SellThroughClient'

export const metadata = { title: 'Velocidade de Venda — War Room OS' }

export default async function SellThroughPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!['ADMIN', 'CEO', 'PRODUCTION_MANAGER', 'COMMERCIAL'].includes(role ?? '')) redirect('/dashboard')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="heading-1">📦 Velocidade de Venda</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
          Sell-through rate por categoria — quantos dias de estoque restam no ritmo atual de vendas.
        </p>
      </div>
      <SellThroughClient />
    </div>
  )
}
