import { getServerSession } from 'next-auth/next'
import { redirect }        from 'next/navigation'
import { authOptions }     from '@/lib/auth'

/**
 * /dashboard/admin/dashboards
 * Hub de Dashboards Inteligentes — redireciona para o painel mais relevante
 * de acordo com o papel do usuário logado.
 */
export default async function DashboardsHubPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.role) redirect('/login')

  const role = session.user.role

  // Mapa de redirecionamento por papel
  const destination: Record<string, string> = {
    ADMIN:              '/dashboard/admin',
    PRODUCTION_MANAGER: '/dashboard/gerente-producao',
    PRODUCER:           '/dashboard/producao',
    COMMERCIAL:         '/dashboard/compras',
    DELIVERER:          '/dashboard/entregas',
    FINANCE:            '/dashboard/financeiro',
    PURCHASING:         '/dashboard/compras',
    MANAGER:            '/dashboard/admin',
  }

  redirect(destination[role] ?? '/dashboard')
}
