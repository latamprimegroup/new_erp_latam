import { getServerSession } from 'next-auth'
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
        <h1 className="heading-1">Saldo e Saque</h1>
      </div>
      <p className="text-gray-600 text-sm mb-6">
        Salário base R$ 2.500 + bônus por meta (200→R$ 1.000 até 600 Elite→R$ 10.000). Solicite saque após o fechamento mensal.
      </p>
      <PlugPlaySaldoClient />
    </div>
  )
}
