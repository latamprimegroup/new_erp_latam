import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { GamificationClient } from './GamificationClient'

export default async function GamificacaoPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login?callbackUrl=/dashboard/cliente/gamificacao')
  if (session.user?.role !== 'CLIENT') redirect('/dashboard')

  return <GamificationClient />
}
