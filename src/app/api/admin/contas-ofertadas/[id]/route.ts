import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { notifyUser } from '@/lib/notifications'

const bodySchema = z.object({
  action: z.enum(['approve', 'reject']),
  rejectionReason: z.string().optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  try {
    const body = await req.json()
    const { action, rejectionReason } = bodySchema.parse(body)

    const account = await prisma.stockAccount.findUnique({
      where: { id },
      include: { manager: { include: { user: { select: { id: true } } } } },
    })
    if (!account) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
    if (account.status !== 'PENDING') {
      return NextResponse.json({ error: 'Conta já foi analisada' }, { status: 400 })
    }

    if (action === 'reject') {
      await prisma.stockAccount.update({
        where: { id },
        data: { status: 'REJECTED' },
      })
      await audit({
        userId: session.user.id,
        action: 'stock_account_rejected',
        entity: 'StockAccount',
        entityId: id,
        details: { reason: rejectionReason },
      })
      if (account.manager?.userId) {
        await notifyUser(
          account.manager.userId,
          'Conta rejeitada',
          `A conta #${id.slice(0, 8)} foi rejeitada.${rejectionReason ? ` Motivo: ${rejectionReason}` : ''}`
        )
      }
      return NextResponse.json({ ok: true, status: 'REJECTED' })
    }

    await prisma.stockAccount.update({
      where: { id },
      data: { status: 'AVAILABLE' },
    })
    await audit({
      userId: session.user.id,
      action: 'stock_account_approved',
      entity: 'StockAccount',
      entityId: id,
    })
    if (account.manager?.userId) {
      await notifyUser(
        account.manager.userId,
        'Conta aprovada',
        `A conta #${id.slice(0, 8)} foi aprovada e está disponível no estoque.`
      )
    }
    return NextResponse.json({ ok: true, status: 'AVAILABLE' })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Erro ao processar' }, { status: 500 })
  }
}
