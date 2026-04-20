import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { ProducaoMetricsClient } from './ProducaoMetricsClient'

export default async function ProducaoMetricsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const isOversight =
    session.user?.role === 'ADMIN' || session.user?.role === 'PRODUCTION_MANAGER'
  const isProducer = session.user?.role === 'PRODUCER'
  if (!isOversight && !isProducer) redirect('/dashboard')

  return (
    <div>
      <div className="flex gap-4 items-center mb-6">
        <Link href="/dashboard/producao" className="text-gray-500 hover:text-gray-700">
          ← Produção
        </Link>
        <h1 className="heading-1">Métricas e Taxa de Sucesso</h1>
      </div>
      <p className="text-gray-600 text-sm mb-6">
        Acompanhe contas aprovadas, reprovadas e motivos. Use para mitigar erros e analisar performance.
      </p>
      <ProducaoMetricsClient isOversight={isOversight} />
    </div>
  )
}
