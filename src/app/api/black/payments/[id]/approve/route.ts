import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const payment = await prisma.blackPayment.findUnique({ where: { id } })
  if (!payment) return NextResponse.json({ error: 'Pagamento não encontrado' }, { status: 404 })
  if (payment.status === 'PAID') {
    return NextResponse.json({ error: 'Já pago' }, { status: 400 })
  }

  const updated = await prisma.blackPayment.update({
    where: { id },
    data: { status: 'PAID', paidAt: new Date(), approvedById: session.user!.id },
  })

  await audit({
    userId: session.user!.id,
    action: 'black_payment_approved',
    entity: 'BlackPayment',
    entityId: id,
    details: { amount: Number(payment.amount) },
  })

  return NextResponse.json(updated)
}
