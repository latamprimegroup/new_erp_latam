import type { Metadata } from 'next'
import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { InventarioClient } from './InventarioClient'

export const metadata: Metadata = {
  title: 'Inventário de Estoque — Ads Ativos',
  description: 'Gestão e auditoria de estoque do gerente de produção.',
}

export default async function InventarioPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!['ADMIN', 'PRODUCTION_MANAGER'].includes(session.user.role ?? ''))
    redirect('/dashboard')

  return <InventarioClient />
}
