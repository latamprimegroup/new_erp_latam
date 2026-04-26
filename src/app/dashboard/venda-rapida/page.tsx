import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { VendaRapidaTab } from '@/app/dashboard/compras/VendaRapidaTab'

export const metadata = { title: 'Venda Rápida PIX — War Room OS' }

export default async function VendaRapidaPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login?callbackUrl=/dashboard/venda-rapida')
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user.role ?? '')) redirect('/dashboard')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          ⚡ Venda Rápida PIX
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Crie links de checkout, gere PIX integrado e envie no WhatsApp sem depender da área de Compras.
        </p>
      </div>
      <VendaRapidaTab />
    </div>
  )
}
