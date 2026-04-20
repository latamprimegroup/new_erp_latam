import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { ArmoryClient } from './ArmoryClient'

export default async function ArmoryPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login?callbackUrl=/dashboard/cliente/armory')
  if (session.user?.role !== 'CLIENT') redirect('/dashboard')
  return <ArmoryClient />
}
