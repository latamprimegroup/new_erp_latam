/**
 * GET /api/compras/ativos/vitrine-meta
 * Dados de performance do vendedor no dia: vendas, faturamento, ticket médio.
 * Acessível por ADMIN, COMMERCIAL.
 */
import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions }     from '@/lib/auth'
import { prisma }          from '@/lib/prisma'

const ALLOWED = ['ADMIN', 'PURCHASING', 'COMMERCIAL', 'FINANCE']

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Vendas do dia (status SOLD ou além, criadas hoje)
  const ordersToday = await prisma.order.findMany({
    where: {
      createdAt: { gte: today },
      status:    { in: ['PAID', 'APPROVED', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] },
    },
    select: { value: true },
  })

  const soldToday    = ordersToday.length
  const revenueToday = ordersToday.reduce((s, o) => s + Number(o.value), 0)
  const ticketMedio  = soldToday > 0 ? revenueToday / soldToday : 0

  return NextResponse.json({ soldToday, revenueToday, ticketMedio })
}
