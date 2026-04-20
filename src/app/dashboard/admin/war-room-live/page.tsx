import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { authOptions } from '@/lib/auth'
import { WarRoomLiveAdminClient } from './WarRoomLiveAdminClient'

export const metadata: Metadata = {
  title: 'War Room Live — Admin',
}

export default async function WarRoomLiveAdminPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const role = session.user?.role
  if (role !== 'ADMIN' && role !== 'COMMERCIAL' && role !== 'PRODUCTION_MANAGER') {
    redirect('/dashboard')
  }
  return <WarRoomLiveAdminClient />
}
