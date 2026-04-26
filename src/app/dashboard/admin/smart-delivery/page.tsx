import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { SmartDeliverySystemClient } from './SmartDeliverySystemClient'

export const metadata = { title: 'SmartDelivery System — War Room OS' }

export default async function SmartDeliveryPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login?callbackUrl=/dashboard/admin/smart-delivery')
  if (session.user.role !== 'ADMIN') redirect('/dashboard')

  return <SmartDeliverySystemClient />
}
