import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const role = session.user?.role
  if (role !== 'ADMIN' && role !== 'COMMERCIAL')
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const type = searchParams.get('type') // tickets | ordens

  if (type === 'ordens') {
    const ordens = await prisma.serviceOrder.findMany({
      where: status ? { status } : undefined,
      include: {
        client: { include: { user: { select: { name: true, email: true } } } },
        ticket: { select: { ticketNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(ordens)
  }

  const tickets = await prisma.supportTicket.findMany({
    where: status ? { status } : undefined,
    include: {
      client: { include: { user: { select: { name: true, email: true } } } },
      serviceOrder: { select: { orderNumber: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(tickets)
}

const updateSchema = z.object({
  id: z.string(),
  type: z.enum(['ticket', 'ordem']),
  status: z.string().optional(),
  resolvedNote: z.string().optional(),
})

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const role = session.user?.role
  if (role !== 'ADMIN' && role !== 'COMMERCIAL')
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  try {
    const body = await req.json()
    const data = updateSchema.parse(body)

    if (data.type === 'ticket') {
      await prisma.supportTicket.update({
        where: { id: data.id },
        data: {
          ...(data.status && { status: data.status }),
          ...(data.resolvedNote && { resolvedNote: data.resolvedNote }),
          ...(data.status === 'RESOLVED' && { resolvedAt: new Date() }),
        },
      })
    } else {
      await prisma.serviceOrder.update({
        where: { id: data.id },
        data: {
          ...(data.status && { status: data.status }),
          ...(data.status === 'CONCLUIDA' && { completedAt: new Date() }),
        },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}
