import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { LiveProofLabsClient } from './LiveProofLabsClient'

export default async function LiveProofLabsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login?callbackUrl=/dashboard/cliente/live-proof-labs')
  if (session.user?.role !== 'CLIENT') redirect('/dashboard')
  return <LiveProofLabsClient />
}
