import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { FinanceiroAlfredoFastEntryClient } from './FinanceiroAlfredoFastEntryClient'

export default async function AlfredoFastEntryFinanceiroPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (!['ADMIN', 'FINANCE'].includes(session.user?.role || '')) {
    redirect('/dashboard')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading-1">ALFREDO Fast-Entry</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm mt-1 max-w-3xl">
          Zero Entry Policy: cole o comprovante e a IA lança no sistema. Módulo separado para financeiro pessoal e
          financeiro da empresa, com histórico centralizado.
        </p>
      </div>
      <FinanceiroAlfredoFastEntryClient />
    </div>
  )
}
