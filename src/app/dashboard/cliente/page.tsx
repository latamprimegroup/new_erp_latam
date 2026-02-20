import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ClienteDashboard } from './ClienteDashboard'

export default async function ClienteAreaPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) redirect('/dashboard')

  const [comprasTotal, comprasAprovadas, comprasPendentes, contasDisponiveis] = await Promise.all([
    prisma.order.count({ where: { clientId: client.id } }),
    prisma.order.count({ where: { clientId: client.id, status: 'DELIVERED' } }),
    prisma.order.count({ where: { clientId: client.id, status: { in: ['PENDING', 'PAID', 'IN_DELIVERY'] } } }),
    prisma.stockAccount.count({ where: { status: 'AVAILABLE' } }),
  ])

  return (
    <ClienteDashboard
      kpis={{
        comprasTotal,
        comprasAprovadas,
        comprasPendentes,
        contasDisponiveis,
      }}
    />
  )
}
