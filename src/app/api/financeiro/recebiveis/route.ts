/**
 * Pipeline de Recebíveis
 *
 * GET — lista lançamentos de RECEITA com status PENDING ou OVERDUE,
 *       com informações do pedido e cliente vinculados.
 *       Também atualiza automaticamente PENDING → OVERDUE quando dueDate < agora.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED = ['ADMIN', 'FINANCE']

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)

  // Auto-update PENDING → OVERDUE para vencidos
  await prisma.financialEntry.updateMany({
    where: { type: 'INCOME', entryStatus: 'PENDING', dueDate: { lt: new Date() } },
    data: { entryStatus: 'OVERDUE' },
  })

  const entries = await prisma.financialEntry.findMany({
    where: {
      type: 'INCOME',
      entryStatus: { in: ['PENDING', 'OVERDUE'] },
    },
    orderBy: [{ entryStatus: 'asc' }, { dueDate: 'asc' }],
    take: limit,
    include: {
      order: {
        select: {
          id: true,
          product: true,
          quantity: true,
          status: true,
          paidAt: true,
          paymentMethod: true,
          client: {
            select: {
              clientCode: true,
              user: { select: { name: true, email: true, phone: true } },
            },
          },
          seller: { select: { name: true, email: true } },
        },
      },
      wallet: { select: { name: true, icon: true } },
    },
  })

  // Subtotais por status
  const [totalPending, totalOverdue] = await Promise.all([
    prisma.financialEntry.aggregate({
      where: { type: 'INCOME', entryStatus: 'PENDING' },
      _sum: { value: true },
      _count: true,
    }),
    prisma.financialEntry.aggregate({
      where: { type: 'INCOME', entryStatus: 'OVERDUE' },
      _sum: { value: true },
      _count: true,
    }),
  ])

  return NextResponse.json({
    entries,
    summary: {
      pending: {
        count: totalPending._count,
        value: Number(totalPending._sum.value ?? 0),
      },
      overdue: {
        count: totalOverdue._count,
        value: Number(totalOverdue._sum.value ?? 0),
      },
      total: {
        count: totalPending._count + totalOverdue._count,
        value: Number(totalPending._sum.value ?? 0) + Number(totalOverdue._sum.value ?? 0),
      },
    },
  })
}
