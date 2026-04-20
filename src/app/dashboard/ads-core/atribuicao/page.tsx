import { Suspense } from 'react'
import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { AdsCoreAtribuicaoClient } from '../AdsCoreAtribuicaoClient'

export default async function AdsCoreAtribuicaoPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login?callbackUrl=/dashboard/ads-core/atribuicao')

  const role = session.user.role
  if (role !== 'ADMIN' && role !== 'PRODUCTION_MANAGER') {
    redirect('/dashboard/ads-core')
  }

  return (
    <Suspense fallback={<p className="text-gray-500 p-4">Carregando estoque…</p>}>
      <AdsCoreAtribuicaoClient />
    </Suspense>
  )
}
