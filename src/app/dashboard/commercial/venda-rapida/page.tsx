import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'

export default async function CommercialVendaRapidaAliasPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['ADMIN', 'COMMERCIAL'].includes(session.user.role)) {
    redirect('/dashboard')
  }
  redirect('/dashboard/venda-rapida')
}
