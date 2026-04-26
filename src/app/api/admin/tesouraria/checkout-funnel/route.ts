/**
 * GET /api/admin/tesouraria/checkout-funnel
 *
 * Taxa de conversão PIX: PIX gerado → PIX pago.
 * Drop-off por listing e por dia (últimos 30d).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { subDays } from 'date-fns'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!['ADMIN', 'CEO'].includes(role ?? '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const days  = Math.min(90, Math.max(7, Number.parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10)))
  const since = subDays(new Date(), days)

  // Total de checkouts gerados vs pagos no período
  const [totalGenerated, totalPaid] = await Promise.all([
    prisma.quickSaleCheckout.count({ where: { createdAt: { gte: since } } }),
    prisma.quickSaleCheckout.count({ where: { status: 'PAID', paidAt: { gte: since } } }),
  ])

  // Por listing — top 10 por volume
  const byListing = await prisma.quickSaleCheckout.groupBy({
    by:    ['listingId'],
    where: { createdAt: { gte: since } },
    _count: { id: true },
  }).catch(() => [] as never[])

  const paidByListing = await prisma.quickSaleCheckout.groupBy({
    by:    ['listingId'],
    where: { status: 'PAID', paidAt: { gte: since } },
    _count: { id: true },
    _sum:  { totalAmount: true },
  }).catch(() => [] as never[])

  const paidMap = new Map(paidByListing.map((r) => [r.listingId, r]))

  // Busca nomes dos listings
  const listingIds = byListing.map((r) => r.listingId).slice(0, 15)
  const listings   = await prisma.productListing.findMany({
    where: { id: { in: listingIds } },
    select: { id: true, title: true, slug: true },
  }).catch(() => [] as never[])
  const listingMap = new Map(listings.map((l) => [l.id, l]))

  const funnelByListing = byListing
    .map((r) => {
      const paid       = paidMap.get(r.listingId)
      const generated  = r._count.id
      const paidCount  = paid?._count.id ?? 0
      const revenueBrl = Number(paid?._sum?.totalAmount ?? 0)
      const listing    = listingMap.get(r.listingId)
      return {
        listingId:    r.listingId,
        title:        listing?.title ?? r.listingId,
        slug:         listing?.slug ?? '',
        generated,
        paid:         paidCount,
        conversionPct: generated > 0 ? Math.round((paidCount / generated) * 10000) / 100 : 0,
        revenueBrl:   Math.round(revenueBrl * 100) / 100,
      }
    })
    .sort((a, b) => b.generated - a.generated)
    .slice(0, 10)

  // Valor médio por transação
  const avgTicket = await prisma.quickSaleCheckout.aggregate({
    where: { status: 'PAID', paidAt: { gte: since } },
    _avg:  { totalAmount: true },
  }).catch(() => ({ _avg: { totalAmount: 0 } }))

  // Tempo médio de conversão (criação → pagamento) em horas
  const paidWithDates = await prisma.quickSaleCheckout.findMany({
    where: {
      status: 'PAID',
      paidAt: { gte: since },
    },
    select: { createdAt: true, paidAt: true },
    take:   200,
  }).catch(() => [] as never[])

  const conversionTimes = paidWithDates
    .filter((r) => r.paidAt)
    .map((r) => (r.paidAt!.getTime() - r.createdAt.getTime()) / 3_600_000)
    .filter((h) => h >= 0 && h <= 24)

  const avgConversionHours = conversionTimes.length > 0
    ? Math.round(conversionTimes.reduce((a, b) => a + b, 0) / conversionTimes.length * 10) / 10
    : null

  // Checkouts expirados sem pagamento (abandonados)
  const expired = await prisma.quickSaleCheckout.count({
    where: {
      status:    { not: 'PAID' },
      expiresAt: { lt: new Date(), gte: since },
    },
  }).catch(() => 0)

  return NextResponse.json({
    period: { days },
    funnel: {
      generated:        totalGenerated,
      paid:             totalPaid,
      expired,
      conversionPct:    totalGenerated > 0 ? Math.round((totalPaid / totalGenerated) * 10000) / 100 : 0,
      dropOffPct:       totalGenerated > 0 ? Math.round(((totalGenerated - totalPaid) / totalGenerated) * 10000) / 100 : 0,
      avgTicketBrl:     Math.round(Number(avgTicket._avg.totalAmount ?? 0) * 100) / 100,
      avgConversionHours,
    },
    byListing: funnelByListing,
  })
}
