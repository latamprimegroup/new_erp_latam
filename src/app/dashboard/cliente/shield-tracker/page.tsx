import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { ShieldTrackerClient } from './ShieldTrackerClient'

export default async function ShieldTrackerPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login?callbackUrl=/dashboard/cliente/shield-tracker')
  if (session.user?.role !== 'CLIENT') redirect('/dashboard')
  return <ShieldTrackerClient />
}
