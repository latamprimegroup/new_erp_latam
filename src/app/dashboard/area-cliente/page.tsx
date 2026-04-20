import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { ClientAssetGeneratorClient } from '@/components/client/ClientAssetGeneratorClient'

export default async function AreaClientePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user?.role !== 'CLIENT') redirect('/dashboard')

  return (
    <div>
      <h1 className="heading-1 mb-2">Area do Cliente - Gerador de Ativos</h1>
      <p className="text-sm text-gray-400 mb-6">
        Gere site e campanhas Search em menos de 1 minuto com blocos prontos para copiar.
      </p>
      <ClientAssetGeneratorClient />
    </div>
  )
}
