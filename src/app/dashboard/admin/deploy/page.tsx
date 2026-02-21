import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DeployAgentClient } from './DeployAgentClient'

export default async function DeployPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login?callbackUrl=/dashboard/admin/deploy')
  if (session.user?.role !== 'ADMIN') redirect('/dashboard')

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="heading-1 mb-2">Agente de Deploy</h1>
      <p className="text-muted mb-6">
        Publicar e atualizar o ERP de forma guiada e segura
      </p>
      <DeployAgentClient />
    </div>
  )
}
