import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ProfitEngineClient } from './ProfitEngineClient'

export default async function ProfitEnginePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user?.role !== 'ADMIN') redirect('/dashboard')
  return <ProfitEngineClient />
}
