import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { ProfitBoardClient } from './ProfitBoardClient'

export default async function ProfitBoardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login?callbackUrl=/dashboard/cliente/profit-board')
  if (session.user?.role !== 'CLIENT') redirect('/dashboard')
  return <ProfitBoardClient />
}
