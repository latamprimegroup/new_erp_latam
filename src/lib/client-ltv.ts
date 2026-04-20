/**
 * LTV do cliente: dados agregados e histórico para aumentar retenção
 */

import { prisma } from './prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { recalculateCustomerScore } from './reputation-engine'

export type ClientLTV = {
  client: {
    id: string
    clientCode: string | null
    user: { name: string | null; email: string; phone: string | null }
    whatsapp: string | null
    country: string | null
    lastPurchaseAt: Date | null
    totalSpent: number
    totalAccountsBought: number
    ordersCount: number
  }
  orders: Array<{
    id: string
    product: string
    accountType: string
    quantity: number
    value: number
    status: string
    paidAt: Date | null
    createdAt: Date
  }>
  accountsDelivered: Array<{
    id: string
    platform: string
    type: string
    deliveredAt: Date | null
    email?: string | null
    cnpj?: string | null
    productionEmail?: string | null
  }>
}

/**
 * Sincroniza lastPurchaseAt, totalSpent e totalAccountsBought do ClientProfile
 * baseado em pedidos pagos/entregues
 */
export async function syncClientLTV(clientId: string): Promise<void> {
  const orders = await prisma.order.findMany({
    where: {
      clientId,
      status: { in: ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] },
      paidAt: { not: null },
    },
    select: {
      value: true,
      quantity: true,
      paidAt: true,
    },
  })

  const totalSpent = orders.reduce((acc, o) => acc + Number(o.value), 0)
  const totalAccountsBought = orders.reduce((acc, o) => acc + o.quantity, 0)
  const lastPurchaseAt = orders.length
    ? orders
        .map((o) => o.paidAt)
        .filter((d): d is Date => d != null)
        .sort((a, b) => b.getTime() - a.getTime())[0]
    : null

  await prisma.clientProfile.update({
    where: { id: clientId },
    data: {
      lastPurchaseAt,
      totalSpent: new Decimal(totalSpent),
      totalAccountsBought,
    },
  })
  await recalculateCustomerScore(clientId).catch(console.error)
}

/**
 * Retorna dados completos do cliente para LTV e histórico
 */
export async function getClientLTV(clientId: string): Promise<ClientLTV | null> {
  const client = await prisma.clientProfile.findUnique({
    where: { id: clientId },
    include: {
      user: { select: { name: true, email: true, phone: true } },
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          product: true,
          accountType: true,
          quantity: true,
          value: true,
          status: true,
          paidAt: true,
          createdAt: true,
        },
      },
      accountsDelivered: {
        where: { status: { in: ['DELIVERED', 'IN_USE'] } },
        include: {
          productionAccount: {
            select: {
              email: true,
              cnpj: true,
              emailConsumed: { select: { email: true } },
              cnpjConsumed: { select: { cnpj: true } },
            },
          },
        },
        orderBy: { deliveredAt: 'desc' },
        take: 100,
      },
    },
  })

  if (!client) return null

  const ordersPaid = client.orders.filter((o) =>
    ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'].includes(o.status)
  )
  const totalSpent = ordersPaid.reduce((acc, o) => acc + Number(o.value), 0)
  const totalAccountsBought = ordersPaid.reduce((acc, o) => acc + o.quantity, 0)

  return {
    client: {
      id: client.id,
      clientCode: client.clientCode,
      user: client.user,
      whatsapp: client.whatsapp,
      country: client.country,
      lastPurchaseAt: client.lastPurchaseAt,
      totalSpent: Number(client.totalSpent ?? totalSpent),
      totalAccountsBought: client.totalAccountsBought || totalAccountsBought,
      ordersCount: client.orders.length,
    },
    orders: client.orders.map((o) => ({
      id: o.id,
      product: o.product,
      accountType: o.accountType,
      quantity: o.quantity,
      value: Number(o.value),
      status: o.status,
      paidAt: o.paidAt,
      createdAt: o.createdAt,
    })),
    accountsDelivered: client.accountsDelivered.map((a) => ({
      id: a.id,
      platform: a.platform,
      type: a.type,
      deliveredAt: a.deliveredAt,
      email: a.productionAccount?.email ?? a.productionAccount?.emailConsumed?.email,
      cnpj: a.productionAccount?.cnpj ?? a.productionAccount?.cnpjConsumed?.cnpj,
      productionEmail: a.productionAccount?.email,
    })),
  }
}
