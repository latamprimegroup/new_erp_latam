import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { authOptions } from '@/lib/auth'
import { ProvisioningDashboardClient } from './ProvisioningDashboardClient'

export const metadata: Metadata = {
  title: 'Provisioning Engine',
  description: 'Domínios e landers em massa — Cloudflare e fila de processamento.',
}

export default async function ProvisioningPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user?.role !== 'ADMIN') redirect('/dashboard')

  return <ProvisioningDashboardClient />
}
