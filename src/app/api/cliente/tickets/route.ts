import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'

const createSchema = z.object({
  subject: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(['GERAL', 'DUVIDA', 'PROBLEMA', 'SOLICITACAO']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  createServiceOrder: z.boolean().optional(),
  serviceOrderType: z.string().optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const tickets = await prisma.supportTicket.findMany({
    where: { clientId: client.id },
    include: { serviceOrder: true },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(tickets)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    include: { user: true },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  try {
    const body = await req.json()
    const data = createSchema.parse(body)

    const count = await prisma.supportTicket.count()
    const ticketNumber = `TKT-${String(count + 1).padStart(4, '0')}`

    const ticket = await prisma.supportTicket.create({
      data: {
        clientId: client.id,
        subject: data.subject,
        description: data.description,
        category: data.category || 'GERAL',
        priority: data.priority || 'NORMAL',
        ticketNumber,
      },
    })

    let serviceOrder: { id: string; orderNumber: string } | null = null
    if (data.createServiceOrder) {
      const osCount = await prisma.serviceOrder.count()
      const orderNumber = `OS-${String(osCount + 1).padStart(4, '0')}`
      const so = await prisma.serviceOrder.create({
        data: {
          clientId: client.id,
          ticketId: ticket.id,
          type: data.serviceOrderType || 'SUPORTE',
          title: data.subject,
          description: data.description,
          orderNumber,
        },
      })
      serviceOrder = { id: so.id, orderNumber: so.orderNumber }
    }

    const user = client.user
    const whatsappNumber = process.env.WHATSAPP_SUPORTE || process.env.WHATSAPP_COMERCIAL || '5511999999999'
    const phone = client.whatsapp || user?.phone
    const msgToSupport = `🆕 Novo ticket #${ticketNumber}\nCliente: ${user?.name || user?.email || ''}\nAssunto: ${data.subject}\n\n${data.description.slice(0, 200)}${data.description.length > 200 ? '...' : ''}`

    if (process.env.WHATSAPP_API_URL && whatsappNumber) {
      try {
        await sendWhatsApp({ phone: whatsappNumber, message: msgToSupport })
        await prisma.supportTicket.update({
          where: { id: ticket.id },
          data: { whatsappSentAt: new Date() },
        })
      } catch {
        // Log but don't fail
      }
    }

    const whatsappMsg = `Olá! Abri o ticket #${ticketNumber} no suporte Ads Ativos.\nAssunto: ${data.subject}\n\nAguardo retorno.`
    const whatsappUrl = `https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMsg)}`

    return NextResponse.json({
      ticket: { ...ticket, serviceOrder },
      whatsappUrl,
      whatsappMessage: whatsappMsg,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao criar ticket' }, { status: 500 })
  }
}
