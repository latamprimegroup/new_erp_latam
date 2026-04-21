import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED = ['ADMIN', 'FINANCE', 'COMMERCIAL']

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const daysOverdue = parseInt(searchParams.get('daysOverdue') ?? '0', 10)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - daysOverdue)

  // Pedidos com status PAID ou IN_DELIVERY mas sem entrega concluída (overdue)
  const overdueOrders = await prisma.order.findMany({
    where: {
      status: { in: ['PAID', 'APPROVED', 'IN_SEPARATION', 'IN_DELIVERY'] },
      createdAt: { lt: cutoff },
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
    include: {
      client: {
        select: {
          id: true,
          clientCode: true,
          user: { select: { name: true, email: true, phone: true } },
        },
      },
    },
  })

  // Lançamentos financeiros com dueDate vencido e status PENDING ou OVERDUE
  const overdueEntries = await prisma.financialEntry.findMany({
    where: {
      dueDate: { lt: new Date() },
      entryStatus: { in: ['PENDING', 'OVERDUE'] },
    },
    orderBy: { dueDate: 'asc' },
    take: 200,
    include: {
      financialCategory: { select: { name: true } },
      wallet: { select: { name: true } },
    },
  })

  // Atualizar automaticamente status de PENDING para OVERDUE nos vencidos
  await prisma.financialEntry.updateMany({
    where: { dueDate: { lt: new Date() }, entryStatus: 'PENDING' },
    data: { entryStatus: 'OVERDUE' },
  })

  const totalOverdueValue = overdueEntries.reduce((sum, e) => sum + Number(e.value), 0)

  return NextResponse.json({
    overdueOrders,
    overdueEntries,
    totalOverdueValue,
    count: { orders: overdueOrders.length, entries: overdueEntries.length },
  })
}
