import { getServerSession } from 'next-auth/next'
import { redirect }         from 'next/navigation'
import { authOptions }      from '@/lib/auth'
import { PedidosClient }    from './PedidosClient'

export const metadata = { title: 'Pedidos — War Room OS' }

export default async function PedidosPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login?callbackUrl=/dashboard/admin/pedidos')

  const allowed = ['ADMIN', 'COMMERCIAL', 'FINANCE']
  if (!allowed.includes(session.user.role ?? '')) redirect('/dashboard')

  return <PedidosClient userRole={session.user.role ?? ''} />
}
