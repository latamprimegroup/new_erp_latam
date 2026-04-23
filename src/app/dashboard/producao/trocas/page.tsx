import { getServerSession } from 'next-auth/next'
import { redirect }         from 'next/navigation'
import { authOptions }      from '@/lib/auth'
import { TrocasProducaoClient } from './TrocasProducaoClient'

const ALLOWED = ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER']

export const metadata = { title: 'Trocas & Reposição — Produção' }

export default async function TrocasProducaoPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role)) {
    redirect('/dashboard')
  }
  return <TrocasProducaoClient userRole={session.user.role} />
}
