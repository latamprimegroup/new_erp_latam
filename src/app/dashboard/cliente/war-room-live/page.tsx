import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { WarRoomLiveClient } from './WarRoomLiveClient'

export default async function WarRoomLivePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login?callbackUrl=/dashboard/cliente/war-room-live')
  if (session.user?.role !== 'CLIENT') redirect('/dashboard')
  return <WarRoomLiveClient />
}
