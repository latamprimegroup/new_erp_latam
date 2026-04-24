import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { ComprasClient } from './ComprasClient'

const ALLOWED = ['ADMIN', 'PURCHASING', 'COMMERCIAL', 'FINANCE', 'PRODUCTION_MANAGER']

export default async function ComprasPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role)) redirect('/dashboard')
  return <ComprasClient role={session.user.role} />
}
