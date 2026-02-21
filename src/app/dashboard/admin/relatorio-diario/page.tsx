import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { RelatorioDiarioClient } from './RelatorioDiarioClient'

export default async function RelatorioDiarioPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login?callbackUrl=/dashboard/admin/relatorio-diario')
  if (session.user?.role !== 'ADMIN') redirect('/dashboard')

  return (
    <div className="max-w-4xl">
      <h1 className="heading-1 mb-2">Relatório Diário</h1>
      <p className="text-muted mb-6">
        Vendas, produção e progresso das metas do dia
      </p>
      <RelatorioDiarioClient />
    </div>
  )
}
