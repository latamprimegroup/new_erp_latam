import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { AgenteG2Client } from './AgenteG2Client'

export default async function AgenteG2Page() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login?callbackUrl=/dashboard/producao-g2/agente')
  const roles = ['ADMIN', 'PRODUCER', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    redirect('/dashboard/producao-g2')
  }

  return (
    <div className="max-w-5xl">
      <h1 className="heading-1 mb-2">Agente G2 — Dashboard</h1>
      <p className="text-muted mb-6">Meta, ranking e alertas em tempo real</p>
      <AgenteG2Client />
    </div>
  )
}
