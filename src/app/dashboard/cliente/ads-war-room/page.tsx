import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { AdsWarRoomClient } from './AdsWarRoomClient'

export default async function AdsWarRoomPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login?callbackUrl=/dashboard/cliente/ads-war-room')
  if (session.user?.role !== 'CLIENT') redirect('/dashboard')

  return (
    <AdsWarRoomClient
      userName={session.user?.name ?? session.user?.email ?? 'Operador'}
      userEmail={session.user?.email ?? ''}
    />
  )
}
