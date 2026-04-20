import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'

const createOsSchema = z.object({
  ticketId: z.string().min(1),
  type: z.string().max(32).optional(),
})

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

/**
 * Cria Ordem de Serviço vinculada a um ticket (quando ainda não existe OS).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const role = session.user?.role
  if (role !== 'ADMIN' && role !== 'COMMERCIAL')
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  try {
    const body = createOsSchema.parse(await req.json())
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: body.ticketId },
      include: { serviceOrder: true, client: true },
    })
    if (!ticket) return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 })
    if (ticket.serviceOrder) {
      return NextResponse.json({ error: 'Este ticket já possui ordem de serviço' }, { status: 400 })
    }

    const osCount = await prisma.serviceOrder.count()
    const orderNumber = `OS-${String(osCount + 1).padStart(4, '0')}`

    const so = await prisma.serviceOrder.create({
      data: {
        clientId: ticket.clientId,
        ticketId: ticket.id,
        type: body.type || 'SUPORTE',
        title: ticket.subject,
        description: ticket.description,
        orderNumber,
      },
    })

    await audit({
      userId: session.user.id,
      action: 'service_order_created_from_ticket',
      entity: 'ServiceOrder',
      entityId: so.id,
      details: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber, orderNumber: so.orderNumber },
    })

    return NextResponse.json({ ok: true, serviceOrder: { id: so.id, orderNumber: so.orderNumber } })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao criar OS' }, { status: 500 })
  }
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
      const before = await prisma.supportTicket.findUnique({
        where: { id: data.id },
        include: { client: { include: { user: { select: { phone: true, email: true, name: true } } } } },
      })
      if (!before) return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 })

      await prisma.supportTicket.update({
        where: { id: data.id },
        data: {
          ...(data.status && { status: data.status }),
          ...(data.resolvedNote && { resolvedNote: data.resolvedNote }),
          ...(data.status === 'RESOLVED' && { resolvedAt: new Date() }),
        },
      })

      const targetPhone = before.client.whatsapp || before.client.user?.phone
      if (targetPhone && process.env.WHATSAPP_API_URL) {
        const note = data.resolvedNote?.trim()
        if (note) {
          void sendWhatsApp({
            phone: targetPhone,
            message: `📋 Ticket ${before.ticketNumber}\n\n${note.slice(0, 500)}`,
          }).catch(() => {})
        } else if (data.status === 'RESOLVED') {
          void sendWhatsApp({
            phone: targetPhone,
            message: `✅ Ticket ${before.ticketNumber} foi resolvido. Veja detalhes em Suporte na Área do Cliente.`,
          }).catch(() => {})
        }
      }
    } else {
      const order = await prisma.serviceOrder.findUnique({
        where: { id: data.id },
        include: { client: { include: { user: { select: { phone: true } } } } },
      })
      if (!order) return NextResponse.json({ error: 'Ordem não encontrada' }, { status: 404 })

      await prisma.serviceOrder.update({
        where: { id: data.id },
        data: {
          ...(data.status && { status: data.status }),
          ...(data.status === 'CONCLUIDA' && { completedAt: new Date() }),
        },
      })

      const targetPhone = order.client.whatsapp || order.client.user?.phone
      if (data.status === 'CONCLUIDA' && targetPhone && process.env.WHATSAPP_API_URL) {
        void sendWhatsApp({
          phone: targetPhone,
          message: `✅ Sua ordem de serviço ${order.orderNumber} foi concluída. Verifique a Área do Cliente.`,
        }).catch(() => {})
      }
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
