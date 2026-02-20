import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

const createSchema = z.object({
  quantity: z.number().int().positive(),
  reason: z.enum(['BLOQUEIO', 'LIMITE_GASTO', 'ERRO_ESTRUTURAL', 'PROBLEMA_PERFIL', 'OUTRO']),
  reasonOther: z.string().optional(),
})

const updateStatusSchema = z.object({
  status: z.enum(['APROVADA', 'NEGADA', 'CONCLUIDA']),
  notes: z.string().optional(),
})

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'DELIVERER', 'COMMERCIAL']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const repositions = await prisma.deliveryReposition.findMany({
    where: { deliveryId: id },
    include: { analyst: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(repositions)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'DELIVERER', 'COMMERCIAL']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const delivery = await prisma.deliveryGroup.findUnique({ where: { id } })
  if (!delivery) return NextResponse.json({ error: 'Entrega não encontrada' }, { status: 404 })

  try {
    const body = await req.json()
    const data = createSchema.parse(body)

    if (data.reason === 'OUTRO' && !data.reasonOther?.trim()) {
      return NextResponse.json({ error: 'Informe o motivo quando selecionar "Outro"' }, { status: 400 })
    }

    if (data.quantity > delivery.quantityDelivered) {
      return NextResponse.json({
        error: 'Quantidade a repor não pode ser maior que a quantidade já entregue',
      }, { status: 400 })
    }

    const reposition = await prisma.deliveryReposition.create({
      data: {
        deliveryId: id,
        quantity: data.quantity,
        reason: data.reason as 'BLOQUEIO' | 'LIMITE_GASTO' | 'ERRO_ESTRUTURAL' | 'PROBLEMA_PERFIL' | 'OUTRO',
        reasonOther: data.reasonOther || null,
        status: 'SOLICITADA',
      },
    })

    await prisma.deliveryGroup.update({
      where: { id },
      data: { status: 'EM_REPOSICAO' },
    })

    await prisma.deliveryGroupLog.create({
      data: {
        deliveryId: id,
        userId: session.user.id,
        action: 'reposition_created',
        entity: 'DeliveryReposition',
        entityId: reposition.id,
        details: { quantity: data.quantity, reason: data.reason },
      },
    })

    await audit({
      userId: session.user.id,
      action: 'reposition_created',
      entity: 'DeliveryReposition',
      entityId: reposition.id,
      details: { deliveryId: id, quantity: data.quantity },
    })

    return NextResponse.json(reposition)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao registrar reposição' }, { status: 500 })
  }
}
