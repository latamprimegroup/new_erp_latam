import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { MetasMensaisCard } from './MetasMensaisCard'
import { DashboardExecutivo } from './DashboardExecutivo'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (session?.user?.role === 'CLIENT') redirect('/dashboard/cliente')
  if (session?.user?.role === 'MANAGER') redirect('/dashboard/gestor')
  if (session?.user?.role === 'PLUG_PLAY') redirect('/dashboard/plugplay')

  const isAdmin = session?.user?.role === 'ADMIN'

  return (
    <div className="animate-fade-in">
      <h1 className="heading-1 mb-2">Dashboard Executivo</h1>
      <p className="text-slate-600">
        Bem-vindo(a), <span className="font-semibold text-slate-800">{session?.user?.name || session?.user?.email}</span>
      </p>
      <p className="text-muted mt-1">Visão operacional em tempo real</p>

      <div className="mt-8 space-y-8">
        <section>
          <h2 className="font-semibold text-lg mb-4">KPIs e Metas</h2>
          <DashboardExecutivo />
        </section>
        <MetasMensaisCard isAdmin={isAdmin} />
      </div>
    </div>
  )
}
