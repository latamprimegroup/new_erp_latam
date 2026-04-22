import { getServerSession } from 'next-auth/next'
import { redirect }          from 'next/navigation'
import { authOptions }       from '@/lib/auth'
import { SocioDashboard }    from './SocioDashboard'

export const metadata = { title: 'Wealth Dashboard — Ads Ativos', robots: 'noindex, nofollow' }

export default async function SocioPage() {
  const session = await getServerSession(authOptions)

  // Dupla barreira: middleware já bloqueia, mas verificamos aqui também
  if (!session?.user || session.user.role !== 'ADMIN') redirect('/dashboard')

  return (
    <div className="container-page">
      <SocioDashboard userName={session.user.name ?? 'Sócio'} />
    </div>
  )
}
