import Link from 'next/link'
import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { GtmInstructions } from '@/components/gtm/GtmInstructions'

const ALLOWED = new Set([
  'ADMIN',
  'COMMERCIAL',
  'FINANCE',
  'DELIVERER',
  'PRODUCER',
  'PRODUCTION_MANAGER',
  'MANAGER',
  'PLUG_PLAY',
])

export default async function GtmConversaoInternoPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const role = session.user?.role || ''
  if (!ALLOWED.has(role)) redirect('/dashboard')

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard" className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
          ← Dashboard
        </Link>
        <h1 className="heading-1">GTM — Atribuição e WhatsApp</h1>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 max-w-3xl">
        Guia para orientar clientes: cada um cadastra o próprio{' '}
        <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">GTM-XXXXXXX</code> em{' '}
        <strong>Meu Perfil</strong>. O fallback global <code className="text-xs">NEXT_PUBLIC_GTM_ID</code> no servidor
        cobre apenas o ERP quando o cliente não tem ID próprio.
      </p>

      <div className="card max-w-3xl">
        <h2 className="font-semibold mb-4">Passo a passo (painel GTM do cliente)</h2>
        <GtmInstructions />
      </div>
    </div>
  )
}
