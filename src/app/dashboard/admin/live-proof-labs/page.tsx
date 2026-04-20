import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { LiveProofLabsAdminClient } from './LiveProofLabsAdminClient'

export default async function AdminLiveProofLabsPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') redirect('/dashboard')
  return <LiveProofLabsAdminClient />
}
