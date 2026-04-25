import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { SubscriptionsAdmin } from './SubscriptionsAdmin'

export const metadata = { title: 'Recorrência & Assinaturas — War Room OS' }

export default async function SubscriptionsPage() {
  const session = await getServerSession(authOptions)
  const role    = (session?.user as { role?: string } | undefined)?.role
  if (role !== 'ADMIN' && role !== 'COMMERCIAL') redirect('/dashboard')
  return <SubscriptionsAdmin />
}
