import { getServerSession } from 'next/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { SaldoSaqueClient } from './SaldoSaqueClient'

export default async function SaldoPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const roles = ['ADMIN', 'PRODUCER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    redirect('/dashboard')
  }

  return (
    <div>
      <div className="flex gap-4 items-center mb-6">
        <Link href="/dashboard/producao" className="text-gray-500 hover:text-gray-700">
          ← Produção
        </Link>
        <h1 className="heading-1">Saldo e Saque</h1>
      </div>
      <p className="text-gray-600 text-sm mb-6">
        Salário base + valor por conta aprovada + bônus de meta. Solicite saque quando houver saldo disponível (após fechamento mensal).
      </p>
      <SaldoSaqueClient />
    </div>
  )
}
