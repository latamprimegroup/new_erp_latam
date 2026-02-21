import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { PlugPlayClient } from './PlugPlayClient'

export default async function PlugPlayPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user?.role !== 'PLUG_PLAY' && session.user?.role !== 'ADMIN') {
    redirect('/dashboard')
  }

  const isAdmin = session.user?.role === 'ADMIN'

  return (
    <div>
      <h1 className="heading-1 mb-2">Contingência Black – Plug & Play</h1>
      <p className="text-[#1F2937]/80">
        Processo completo: aquecimento → domínio → cloaker → páginas → YouTube → criativo. Pagamento por conta que durou +24h no ar.
      </p>
      <PlugPlayClient isAdmin={isAdmin} />
    </div>
  )
}
