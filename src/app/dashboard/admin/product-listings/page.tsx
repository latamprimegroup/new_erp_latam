import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { ProductListingsAdmin } from './ProductListingsAdmin'

export const metadata = { title: 'Produtos & Onboarding — War Room OS' }

export default async function ProductListingsPage() {
  const session = await getServerSession(authOptions)
  const role    = (session?.user as { role?: string } | undefined)?.role
  if (role !== 'ADMIN' && role !== 'COMMERCIAL') redirect('/dashboard')

  return <ProductListingsAdmin />
}
