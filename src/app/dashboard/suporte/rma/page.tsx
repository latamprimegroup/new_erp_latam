import { Suspense } from 'react'
import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { RmaSuporteClient } from './RmaSuporteClient'

const ROLES = ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER', 'DELIVERER', 'COMMERCIAL'] as const

export default async function SuporteRmaPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (!session.user?.role || !ROLES.includes(session.user.role as (typeof ROLES)[number])) {
    redirect('/dashboard')
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-1">Suporte — Reposição (RMA)</h1>
      <p className="text-sm text-zinc-500 mb-8">
        Fila de solicitações de reposição Plug &amp; Play: SLA, motivos e conversa com o cliente.
      </p>
      <Suspense
        fallback={<p className="text-zinc-500 text-sm">A carregar…</p>}
      >
        <RmaSuporteClient />
      </Suspense>
    </div>
  )
}
