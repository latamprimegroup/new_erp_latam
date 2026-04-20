import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { GatekeeperAlmoxarifadoClient } from './GatekeeperAlmoxarifadoClient'

export default async function GatekeeperAlmoxarifadoPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user?.role !== 'ADMIN') redirect('/dashboard')
  return <GatekeeperAlmoxarifadoClient />
}
