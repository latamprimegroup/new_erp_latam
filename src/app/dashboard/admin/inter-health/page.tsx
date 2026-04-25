import { getServerSession } from 'next-auth/next'
import { redirect }        from 'next/navigation'
import { authOptions }     from '@/lib/auth'
import { InterHealthClient } from './InterHealthClient'

export const metadata = { title: 'Saúde API Inter — War Room OS' }

export default async function InterHealthPage() {
  const session = await getServerSession(authOptions)
  if ((session?.user as { role?: string } | undefined)?.role !== 'ADMIN') redirect('/dashboard')
  return <InterHealthClient />
}
