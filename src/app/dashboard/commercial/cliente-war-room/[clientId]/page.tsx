import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { WarRoomClienteClient } from '../WarRoomClienteClient'

export default async function ClienteWarRoomPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) {
    redirect('/dashboard')
  }
  const { clientId } = await params
  return <WarRoomClienteClient clientId={clientId} />
}
