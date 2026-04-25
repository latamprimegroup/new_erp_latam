import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { RegistrarQuedaClient } from './RegistrarQuedaClient'

export const metadata = { title: 'Registrar Queda de Ativo — War Room OS' }

export default async function RegistrarQuedaPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const allowed = ['ADMIN', 'COMMERCIAL', 'PRODUCER', 'PRODUCTION_MANAGER', 'DELIVERER', 'PURCHASING', 'CLIENT']
  if (!allowed.includes(session.user.role ?? '')) redirect('/dashboard')

  return (
    <RegistrarQuedaClient
      userId={session.user.id}
      userName={session.user.name ?? session.user.email ?? ''}
      userRole={session.user.role ?? ''}
    />
  )
}
