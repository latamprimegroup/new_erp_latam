import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { WarRoomClient } from './WarRoomClient'

export default async function WarRoomPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user?.role !== 'ADMIN') redirect('/dashboard')
  return <WarRoomClient />
}
