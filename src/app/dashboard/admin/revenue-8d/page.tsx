import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { Revenue8dClient } from './Revenue8dClient'

export const metadata = { title: 'Motor de 8 Dígitos — War Room OS' }

export default async function Revenue8dPage() {
  const session = await getServerSession(authOptions)
  const role    = (session?.user as { role?: string } | undefined)?.role
  if (role !== 'ADMIN') redirect('/dashboard')
  return <Revenue8dClient />
}
