import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { PlugPlaySaldoClient } from './PlugPlaySaldoClient'

export default async function PlugPlaySaldoPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const isPlugPlay = session.user?.role === 'PLUG_PLAY'
  const isAdmin = session.user?.role === 'ADMIN'
  if (!isPlugPlay && !isAdmin) redirect('/dashboard')

  return (
    <div>
      <div className="flex gap-4 items-center mb-6">
        <Link href="/dashboard/plugplay" className="text-gray-500 hover:text-gray-700">
          ← Plug & Play
        </Link>
        <h1 className="heading-1">Saldo e Saque — Operação Plug &amp; Play</h1>
      </div>
      <p className="text-gray-600 dark:text-gray-400 text-sm mb-6 max-w-3xl">
        Comissão por setup concluído + bônus de retenção. O saldo sacável reflete fechamentos mensais; a comissão por
        conta entra na prévia após a conta passar +24h no ar (hold de 24h — se banir antes, o valor não migra para
        sucesso). Classifique quedas técnicas para contestação.
      </p>
      <PlugPlaySaldoClient />
    </div>
  )
}
