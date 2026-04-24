import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { canManageCommercialTeam } from '@/lib/commercial-hierarchy'

export default async function CommercialOxygenPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) redirect('/dashboard')
  if (canManageCommercialTeam(session.user?.role, session.user?.cargo)) {
    redirect('/dashboard/commercial/manager')
  }
  redirect('/dashboard/commercial/seller')
}
