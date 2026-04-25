import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { SupplierHealthDashboard } from './SupplierHealthDashboard'

export const metadata = { title: 'Saúde de Fornecedores — CEO View | War Room OS' }

export default async function SupplierHealthPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!['ADMIN', 'PURCHASING', 'FINANCE'].includes(session.user.role ?? '')) redirect('/dashboard')
  return <SupplierHealthDashboard />
}
