import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getClienteBatchPerformance } from '@/lib/cliente-batch-performance'
import { getClienteLandingPackLine, getClientePipelineLines } from '@/lib/cliente-dashboard-context'
import { ClienteDashboard } from './ClienteDashboard'

const STATUS_EM_ANALISE = ['PENDING', 'APPROVED', 'PAID', 'IN_SEPARATION', 'IN_DELIVERY'] as const

export default async function ClienteAreaPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) redirect('/dashboard')

  const [
    comprasTotal,
    comprasAprovadas,
    comprasPendentes,
    contasDisponiveis,
    batchPerformance,
    pipelineLines,
    landingPackLine,
  ] = await Promise.all([
    prisma.order.count({ where: { clientId: client.id } }),
    prisma.order.count({ where: { clientId: client.id, status: 'DELIVERED' } }),
    prisma.order.count({ where: { clientId: client.id, status: { in: [...STATUS_EM_ANALISE] } } }),
    prisma.stockAccount.count({ where: { status: 'AVAILABLE' } }),
    getClienteBatchPerformance(client.id),
    getClientePipelineLines(client.id, 4),
    getClienteLandingPackLine(client.id),
  ])

  return (
    <ClienteDashboard
      kpis={{
        comprasTotal,
        comprasAprovadas,
        comprasPendentes,
        contasDisponiveis,
      }}
      batchPerformance={batchPerformance}
      pipelineLines={pipelineLines}
      landingPackLine={landingPackLine}
    />
  )
}
