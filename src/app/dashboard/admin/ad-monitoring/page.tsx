import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { AdMonitoringClient } from './AdMonitoringClient'

export const metadata = { title: 'Monitoramento de Spend — War Room OS' }

export default async function AdMonitoringPage() {
  const session = await getServerSession(authOptions)
  const role    = (session?.user as { role?: string } | undefined)?.role
  if (role !== 'ADMIN' && role !== 'COMMERCIAL') redirect('/dashboard')
  return <AdMonitoringClient />
}
