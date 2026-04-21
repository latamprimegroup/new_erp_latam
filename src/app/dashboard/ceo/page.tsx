import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { CeoCommandCenter } from './CeoCommandCenter'

export const metadata = { title: 'CEO Command Center — Road to R$1M' }

export default async function CeoPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN') redirect('/dashboard')
  return <CeoCommandCenter />
}
