import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { OnboardingClient } from './OnboardingClient'

const ONBOARDING_ROLES = ['ADMIN', 'COMMERCIAL', 'DELIVERER', 'PRODUCER', 'FINANCE', 'MANAGER', 'PRODUCTION_MANAGER']

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const role = session.user?.role
  if (!role || !ONBOARDING_ROLES.includes(role)) redirect('/dashboard')
  return <OnboardingClient />
}
