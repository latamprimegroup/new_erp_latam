/**
 * Score Comercial por Vendedor
 * Agrega receita, margem, LTV médio, taxa retenção
 */
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'

export async function computeSellerCommercialScores(): Promise<number> {
  const refDate = new Date()
  refDate.setHours(0, 0, 0, 0)
  const startOfMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 1)

  const sellers = await prisma.user.findMany({
    where: { role: 'COMMERCIAL' },
    select: { id: true },
  })

  let count = 0

  for (const seller of sellers) {
    const orders = await prisma.order.findMany({
      where: {
        sellerId: seller.id,
        status: { in: ['PAID', 'DELIVERED'] },
        paidAt: { not: null, gte: startOfMonth },
      },
      select: {
        value: true,
        clientId: true,
        paidAt: true,
      },
    })

    const receitaGerada = orders.reduce((s, o) => s + Number(o.value), 0)
    const margemGerada = receitaGerada * 0.25
    const clientIds = [...new Set(orders.map((o) => o.clientId).filter(Boolean))]

    let ltvMedio = 0
    let taxaRetencao: number | null = null

    if (clientIds.length > 0) {
      const clientsWithOrders = await prisma.clientProfile.findMany({
        where: { id: { in: clientIds } },
        include: {
          orders: {
            where: { status: { in: ['PAID', 'DELIVERED'] }, paidAt: { not: null } },
            select: { value: true, paidAt: true },
          },
        },
      })

      ltvMedio = clientsWithOrders.length > 0
        ? clientsWithOrders.reduce((s, c) => {
            const ltv = c.orders.reduce((a, o) => a + Number(o.value), 0)
            return s + ltv
          }, 0) / clientsWithOrders.length
        : 0

      const withMultiple = clientsWithOrders.filter((c) => c.orders.length > 1).length
      taxaRetencao = clientsWithOrders.length > 0 ? (withMultiple / clientsWithOrders.length) * 100 : null
    }

    const scoreReceita = Math.min(100, Math.round(receitaGerada / 100))
    const scoreMargem = Math.min(100, Math.round(margemGerada / 25))
    const scoreLtv = Math.min(100, Math.round(ltvMedio / 50))
    const scoreRetencao = taxaRetencao != null ? Math.round(taxaRetencao) : 50
    const scoreTotal = Math.round(
      scoreReceita * 0.4 + scoreMargem * 0.3 + scoreLtv * 0.2 + scoreRetencao * 0.1
    )

    await prisma.sellerCommercialScore.upsert({
      where: {
        sellerId_referenceDate: { sellerId: seller.id, referenceDate: refDate },
      },
      create: {
        sellerId: seller.id,
        referenceDate: refDate,
        receitaGerada: new Decimal(receitaGerada.toFixed(2)),
        margemGerada: new Decimal(margemGerada.toFixed(2)),
        ltvMedio: new Decimal(ltvMedio.toFixed(2)),
        taxaRetencao: taxaRetencao != null ? new Decimal(taxaRetencao.toFixed(2)) : null,
        scoreTotal: Math.min(100, Math.max(0, scoreTotal)),
      },
      update: {
        receitaGerada: new Decimal(receitaGerada.toFixed(2)),
        margemGerada: new Decimal(margemGerada.toFixed(2)),
        ltvMedio: new Decimal(ltvMedio.toFixed(2)),
        taxaRetencao: taxaRetencao != null ? new Decimal(taxaRetencao.toFixed(2)) : null,
        scoreTotal: Math.min(100, Math.max(0, scoreTotal)),
      },
    })
    count++
  }

  return count
}
