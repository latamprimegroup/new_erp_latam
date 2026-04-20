import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { authOptions } from '@/lib/auth'
import { IntelligenceLeadsClient } from './IntelligenceLeadsClient'

export const metadata: Metadata = {
  title: 'Inteligência de Leads',
  description: 'Central de leads, UTMs e LTV — Ecossistema 9D.',
}

export default async function IntelligenceLeadsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login?callbackUrl=/dashboard/intelligence-leads')
  const roles = ['ADMIN', 'COMMERCIAL', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-zinc-950 text-zinc-100 p-4 lg:p-6">
      <IntelligenceLeadsClient userRole={session.user.role} />
    </div>
  )
}
