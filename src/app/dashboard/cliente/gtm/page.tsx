import Link from 'next/link'
import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GtmInstructions } from '@/components/gtm/GtmInstructions'

export default async function ClienteGtmPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user?.role !== 'CLIENT') redirect('/dashboard')

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    select: { gtmId: true },
  })

  const ok = !!client?.gtmId?.trim()

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/cliente" className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
          ← Voltar
        </Link>
        <h1 className="heading-1">GTM e conversões (WhatsApp)</h1>
      </div>

      <div className="card border-violet-500/20 mb-6">
        <h2 className="font-semibold mb-2">Status do container</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
              ok
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
            }`}
          >
            {ok ? 'GTM ID cadastrado' : 'GTM ID não configurado'}
          </span>
          {client?.gtmId ? (
            <code className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">{client.gtmId}</code>
          ) : null}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
          Cadastre o ID do container em{' '}
          <Link href="/dashboard/cliente/perfil" className="text-violet-600 dark:text-violet-400 underline font-medium">
            Meu Perfil
          </Link>
          . O sistema injeta o GTM dinamicamente (sem hardcode) nas páginas do ERP e nas landings geradas para a sua
          conta.
        </p>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-4">Configuração no Google Tag Manager</h2>
        <GtmInstructions />
      </div>
    </div>
  )
}
