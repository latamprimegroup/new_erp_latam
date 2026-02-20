import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

const createSchema = z.object({
  gateway: z.string().min(1),
  accountId: z.string().optional(),
  value: z.number().positive(),
  fee: z.number().optional(),
  netValue: z.number().positive(),
  dueDate: z.string().optional(),
  risk: z.string().optional(),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const where: Record<string, unknown> = {}
  if (status) where.status = status

  const [withdrawals, pendingCount, heldCount] = await Promise.all([
    prisma.withdrawal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.withdrawal.count({ where: { status: 'PENDING' } }),
    prisma.withdrawal.count({ where: { status: 'HELD' } }),
  ])

  return NextResponse.json({
    withdrawals,
    alerts: { pending: pendingCount, held: heldCount },
  })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = createSchema.parse(body)

    const withdrawal = await prisma.withdrawal.create({
      data: {
        gateway: data.gateway,
        accountId: data.accountId || null,
        value: data.value,
        fee: data.fee ?? null,
        netValue: data.netValue,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        risk: data.risk || null,
      },
    })

    await audit({
      userId: session.user?.id,
      action: 'withdrawal_created',
      entity: 'Withdrawal',
      entityId: withdrawal.id,
      details: { value: data.value, gateway: data.gateway },
    })

    return NextResponse.json(withdrawal)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao registrar' }, { status: 500 })
  }
}

const updateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'HELD', 'FAILED']),
})

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const roles = ['ADMIN', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { id, status } = updateSchema.parse(body)

    const withdrawal = await prisma.withdrawal.update({
      where: { id },
      data: { status },
    })

    await audit({
      userId: session.user.id,
      action: 'withdrawal_status_updated',
      entity: 'Withdrawal',
      entityId: id,
      details: { status },
    })

    return NextResponse.json(withdrawal)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}
