import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getClienteBatchPerformance } from '@/lib/cliente-batch-performance'
import { getClienteLandingPackLine, getClientePipelineLines } from '@/lib/cliente-dashboard-context'

const STATUS_EM_ANALISE = ['PENDING', 'APPROVED', 'PAID', 'IN_SEPARATION', 'IN_DELIVERY'] as const

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Perfil de cliente não encontrado' }, { status: 404 })

  const [
    ordersTotal,
    ordersApproved,
    ordersPending,
    ordersRejected,
    availableCount,
    batchPerformance,
    pipelineLines,
    landingPackLine,
  ] = await Promise.all([
    prisma.order.count({ where: { clientId: client.id } }),
    prisma.order.count({ where: { clientId: client.id, status: 'DELIVERED' } }),
    prisma.order.count({ where: { clientId: client.id, status: { in: [...STATUS_EM_ANALISE] } } }),
    prisma.order.count({ where: { clientId: client.id, status: 'REJECTED' } }),
    prisma.stockAccount.count({ where: { status: 'AVAILABLE' } }),
    getClienteBatchPerformance(client.id),
    getClientePipelineLines(client.id, 4),
    getClienteLandingPackLine(client.id),
  ])

  return NextResponse.json({
    comprasTotal: ordersTotal,
    comprasAprovadas: ordersApproved,
    comprasPendentes: ordersPending,
    comprasRejeitadas: ordersRejected,
    contasDisponiveis: availableCount,
    batchPerformance,
    pipelineLines: pipelineLines.map((l) => ({
      orderId: l.orderId,
      product: l.product,
      quantity: l.quantity,
      status: l.status,
      message: l.message,
    })),
    landingPackLine,
  })
}
