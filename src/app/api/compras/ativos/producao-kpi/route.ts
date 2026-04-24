/**
 * GET /api/compras/ativos/producao-kpi
 * KPIs do painel de produção: TRIAGEM, RECEIVED, custo total, potencial de venda.
 * Acessível por ADMIN, PURCHASING, PRODUCTION_MANAGER.
 */
import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions }     from '@/lib/auth'
import { prisma }          from '@/lib/prisma'

const ALLOWED = ['ADMIN', 'PURCHASING', 'PRODUCTION_MANAGER']

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const [triagemAgg, receivedAgg, availableAgg] = await Promise.all([
    prisma.asset.aggregate({
      where:  { status: 'TRIAGEM' },
      _count: true,
      _sum:   { costPrice: true, salePrice: true },
    }),
    prisma.asset.aggregate({
      where:  { status: 'RECEIVED' },
      _count: true,
      _sum:   { costPrice: true, salePrice: true },
    }),
    prisma.asset.aggregate({
      where:  { status: 'AVAILABLE' },
      _count: true,
      _sum:   { costPrice: true, salePrice: true },
    }),
  ])

  const patrimonioCusto   = Number(triagemAgg._sum.costPrice ?? 0) + Number(receivedAgg._sum.costPrice ?? 0)
  const potencialSale     = Number(availableAgg._sum.salePrice ?? 0)
  const potencialCost     = Number(availableAgg._sum.costPrice ?? 0)
  const margemPotencial   = potencialCost > 0
    ? ((potencialSale - potencialCost) / potencialCost) * 100
    : 0

  return NextResponse.json({
    triagemCount:          triagemAgg._count,
    receivedCount:         receivedAgg._count,
    availableCount:        availableAgg._count,
    patrimonioCusto,
    potencialFaturamento:  potencialSale,
    margemPotencial,
  })
}
