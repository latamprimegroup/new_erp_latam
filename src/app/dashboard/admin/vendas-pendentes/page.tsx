import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { VendasPendentesClient } from './VendasPendentesClient'

export const metadata = { title: 'Vendas Pendentes (KYC) — War Room OS' }

export default async function VendasPendentesPage() {
  const session = await getServerSession(authOptions)
  if ((session?.user as { role?: string } | undefined)?.role !== 'ADMIN') redirect('/dashboard')
  return <VendasPendentesClient />
}

