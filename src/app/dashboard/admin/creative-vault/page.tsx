import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { authOptions } from '@/lib/auth'
import { CreativeVaultAdminClient } from './CreativeVaultAdminClient'

export const metadata: Metadata = {
  title: 'Creative Vault — fila edição',
  description: 'Pedidos de personalização de criativos e workflow interno.',
}

export default async function CreativeVaultAdminPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const role = session.user?.role
  if (role !== 'ADMIN' && role !== 'COMMERCIAL' && role !== 'PRODUCTION_MANAGER') {
    redirect('/dashboard')
  }
  return <CreativeVaultAdminClient />
}
