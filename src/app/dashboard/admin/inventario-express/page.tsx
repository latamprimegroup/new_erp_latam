import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import InventarioExpressClient from './InventarioExpressClient'

export const metadata = { title: 'Inventário Express — ADS Ativos ERP' }

export default async function InventarioExpressPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const allowed = ['ADMIN', 'PRODUCTION_MANAGER']
  if (!session.user?.role || !allowed.includes(session.user.role)) {
    redirect('/dashboard')
  }

  return <InventarioExpressClient />
}
