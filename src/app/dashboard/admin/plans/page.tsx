import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { PlansAdmin } from './PlansAdmin'

export const metadata = { title: 'Catálogo de Planos — War Room OS' }

export default async function PlansPage() {
  const session = await getServerSession(authOptions)
  const role    = (session?.user as { role?: string } | undefined)?.role
  if (role !== 'ADMIN' && role !== 'COMMERCIAL') redirect('/dashboard')
  return <PlansAdmin />
}
