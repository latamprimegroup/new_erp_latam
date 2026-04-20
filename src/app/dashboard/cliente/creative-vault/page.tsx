import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { CreativeVaultClient } from './CreativeVaultClient'

export default async function CreativeVaultPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login?callbackUrl=/dashboard/cliente/creative-vault')
  if (session.user?.role !== 'CLIENT') redirect('/dashboard')
  return <CreativeVaultClient />
}
