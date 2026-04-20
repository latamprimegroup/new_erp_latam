import type { OrderStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const PIPELINE_STATUSES: OrderStatus[] = [
  'PENDING',
  'APPROVED',
  'PAID',
  'IN_SEPARATION',
  'IN_DELIVERY',
]

export type ClientePipelineLine = {
  orderId: string
  product: string
  quantity: number
  status: OrderStatus
  message: string
}

function orderStatusFallback(status: OrderStatus): string {
  switch (status) {
    case 'PENDING':
    case 'APPROVED':
      return 'Pedido em análise administrativa'
    case 'PAID':
      return 'Pagamento confirmado — fila de separação'
    case 'IN_SEPARATION':
      return 'Contas em separação no estoque'
    case 'IN_DELIVERY':
      return 'Plug & Play / entrega técnica em andamento'
    default:
      return 'Em processamento'
  }
}

/**
 * Pedidos em pipeline com mensagem amigável; usa DeliveryGroup e Delivery.responsible quando existirem.
 */
export async function getClientePipelineLines(
  clientId: string,
  limit = 4,
): Promise<ClientePipelineLine[]> {
  const orders = await prisma.order.findMany({
    where: {
      clientId,
      status: { in: PIPELINE_STATUSES },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: {
      delivery: {
        include: { responsible: { select: { name: true } } },
      },
    },
  })

  if (orders.length === 0) return []

  const orderIds = orders.map((o) => o.id)
  const groups = await prisma.deliveryGroup.findMany({
    where: {
      clientId,
      orderId: { in: orderIds },
      status: { notIn: ['FINALIZADA', 'CANCELADA'] },
    },
    include: { responsible: { select: { name: true } } },
    orderBy: { updatedAt: 'desc' },
  })

  const groupByOrderId = new Map<string, (typeof groups)[0]>()
  for (const g of groups) {
    if (g.orderId && !groupByOrderId.has(g.orderId)) groupByOrderId.set(g.orderId, g)
  }

  return orders.map((o) => {
    const g = groupByOrderId.get(o.id)
    const nameFromDelivery = o.delivery?.responsible?.name?.trim()
    const nameFromGroup = g?.responsible?.name?.trim()
    const name = nameFromGroup || nameFromDelivery

    let message = orderStatusFallback(o.status)

    if (g && ['EM_ANDAMENTO', 'PARCIALMENTE_ENTREGUE', 'ATRASADA', 'EM_REPOSICAO'].includes(g.status)) {
      if (name) {
        message = `${name} em setup (grupo ${g.groupNumber})`
      } else {
        message = `Setup em andamento (grupo ${g.groupNumber})`
      }
    } else if (o.status === 'IN_DELIVERY' && name) {
      message = `${name} no Plug & Play`
    } else if (o.status === 'IN_SEPARATION' && name) {
      message = `${name} acompanha a separação no estoque`
    } else if (o.status === 'PAID' && name && o.delivery?.responsibleId) {
      message = `Pós-pagamento — ${name} na operação`
    }

    return {
      orderId: o.id,
      product: o.product,
      quantity: o.quantity,
      status: o.status,
      message,
    }
  })
}

/**
 * Uma linha resumida do pacote Landing (briefing + página + deploy) para a home do cliente.
 */
export async function getClienteLandingPackLine(clientId: string): Promise<string | null> {
  const totalBriefings = await prisma.landingBriefing.count({ where: { clientId } })
  if (totalBriefings === 0) return null

  const [draft, geradoOrPub, pagesPub, live] = await Promise.all([
    prisma.landingBriefing.count({ where: { clientId, status: 'DRAFT' } }),
    prisma.landingBriefing.count({
      where: { clientId, status: { in: ['GERADO', 'PUBLICADO'] } },
    }),
    prisma.landingPage.count({ where: { clientId, status: 'PUBLICADO' } }),
    prisma.landingDeployment.count({ where: { page: { clientId }, status: 'LIVE' } }),
  ])

  const parts: string[] = []
  if (live > 0) {
    parts.push(live === 1 ? '1 site no ar' : `${live} sites no ar`)
  } else if (pagesPub > 0) {
    parts.push(pagesPub === 1 ? '1 página publicada' : `${pagesPub} páginas publicadas`)
  } else if (geradoOrPub > 0) {
    parts.push(
      geradoOrPub === 1 ? '1 landing gerada (hospedagem pendente)' : `${geradoOrPub} landings geradas`,
    )
  }
  if (draft > 0) {
    parts.push(draft === 1 ? '1 briefing em rascunho' : `${draft} briefings em rascunho`)
  }

  return parts.length > 0 ? parts.join(' · ') : 'Pacote em andamento na Fábrica'
}
