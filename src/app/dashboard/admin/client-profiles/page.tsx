import type { Metadata } from 'next'
import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { ClientProfilesAdmin } from './ClientProfilesAdmin'

export const metadata: Metadata = {
  title: 'Perfis de Cliente — Admin · Ads Ativos Global',
}

export default async function ClientProfilesPage() {
  const session = await getServerSession(authOptions)
  if (!['ADMIN', 'COMMERCIAL'].includes(session?.user?.role ?? '')) redirect('/dashboard')

  return <ClientProfilesAdmin />
}
