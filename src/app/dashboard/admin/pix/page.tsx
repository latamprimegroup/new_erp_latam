import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { PixAdminClient } from './PixAdminClient'

export const metadata = {
  title: 'Gestão PIX — War Room OS',
}

export default async function PixAdminPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login?callbackUrl=/dashboard/admin/pix')

  const allowed = ['ADMIN', 'COMMERCIAL', 'FINANCE']
  if (!allowed.includes(session.user.role ?? '')) redirect('/dashboard')

  return <PixAdminClient userRole={session.user.role ?? ''} />
}
