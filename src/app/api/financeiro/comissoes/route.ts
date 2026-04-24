/**
 * Gestão de Comissões
 *
 * GET — lista provisões de comissão pendentes (categoria COMISSOES_VENDEDORES),
 *       enriquecidas com dados do vendedor (via costCenter = userId).
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED = ['ADMIN', 'FINANCE']

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const entries = await prisma.financialEntry.findMany({
    where: {
      category: { in: ['COMISSOES_VENDEDORES', 'COMISSAO_GERENTE'] },
      entryStatus: { in: ['PENDING', 'PAID'] },
    },
    orderBy: [{ entryStatus: 'asc' }, { date: 'desc' }],
    take: 100,
    include: {
      order: {
        select: {
          id: true,
          product: true,
          value: true,
          client: {
            select: {
              clientCode: true,
              user: { select: { name: true } },
            },
          },
        },
      },
    },
  })

  // Enriquece com dados do vendedor (costCenter = userId)
  const sellerIds = [...new Set(entries.map((e) => e.costCenter).filter(Boolean))]
  const sellers = sellerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: sellerIds as string[] } },
        select: { id: true, name: true, email: true, phone: true, commissionRate: true },
      })
    : []

  const sellerMap = Object.fromEntries(sellers.map((s) => [s.id, s]))

  const enriched = entries.map((e) => ({
    ...e,
    value:  Number(e.value),
    seller: e.costCenter ? (sellerMap[e.costCenter] ?? null) : null,
  }))

  // Subtotais
  const pending = enriched.filter((e) => e.entryStatus === 'PENDING')
  const paid    = enriched.filter((e) => e.entryStatus === 'PAID')

  // Agrupado por vendedor
  const bySellerMap: Record<string, { sellerName: string; pendingTotal: number; paidTotal: number; entries: typeof enriched }> = {}
  for (const e of enriched) {
    const key  = e.costCenter ?? 'DESCONHECIDO'
    const name = e.seller?.name ?? e.costCenter ?? 'Desconhecido'
    if (!bySellerMap[key]) bySellerMap[key] = { sellerName: name, pendingTotal: 0, paidTotal: 0, entries: [] }
    bySellerMap[key].entries.push(e)
    if (e.entryStatus === 'PENDING') bySellerMap[key].pendingTotal += e.value
    else bySellerMap[key].paidTotal += e.value
  }

  return NextResponse.json({
    entries:  enriched,
    bySeller: Object.values(bySellerMap),
    summary: {
      pending: { count: pending.length, value: pending.reduce((s, e) => s + e.value, 0) },
      paid:    { count: paid.length,    value: paid.reduce((s, e) => s + e.value, 0) },
    },
  })
}
