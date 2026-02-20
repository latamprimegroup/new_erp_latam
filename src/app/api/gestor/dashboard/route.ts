import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'MANAGER') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const manager = await prisma.managerProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!manager) return NextResponse.json({ error: 'Perfil de gestor não encontrado' }, { status: 404 })

  const [total, emAnalise, aprovadas, rejeitadas] = await Promise.all([
    prisma.stockAccount.count({ where: { managerId: manager.id } }),
    prisma.stockAccount.count({ where: { managerId: manager.id, status: 'PENDING' } }),
    prisma.stockAccount.count({ where: { managerId: manager.id, status: 'APPROVED' } }),
    prisma.stockAccount.count({ where: { managerId: manager.id, status: 'REJECTED' } }),
  ])

  const vendas = await prisma.orderItem.findMany({
    where: { account: { managerId: manager.id } },
    include: { order: { select: { value: true } } },
  })
  const receitaTotal = vendas.reduce((acc, i) => acc + Number(i.order.value), 0)

  return NextResponse.json({
    contasTotal: total,
    contasEmAnalise: emAnalise,
    contasAprovadas: aprovadas,
    contasRejeitadas: rejeitadas,
    vendasCount: vendas.length,
    receitaTotal,
  })
}
