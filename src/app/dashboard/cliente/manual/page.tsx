import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { OperatorManualClient } from './OperatorManualClient'

export default async function OperatorManualPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login?callbackUrl=/dashboard/cliente/manual')
  if (session.user?.role !== 'CLIENT') redirect('/dashboard')

  return <OperatorManualClient />
}
