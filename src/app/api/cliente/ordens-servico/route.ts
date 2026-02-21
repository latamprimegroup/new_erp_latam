import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'

const createSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  scheduledAt: z.string().datetime().optional(),
  ticketId: z.string().optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const orders = await prisma.serviceOrder.findMany({
    where: { clientId: client.id },
    include: { ticket: true },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(orders)
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

    const osCount = await prisma.serviceOrder.count()
    const orderNumber = `OS-${String(osCount + 1).padStart(4, '0')}`

    const order = await prisma.serviceOrder.create({
      data: {
        clientId: client.id,
        ticketId: data.ticketId || null,
        type: data.type,
        title: data.title,
        description: data.description,
        orderNumber,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      },
    })

    const whatsappNumber = process.env.WHATSAPP_SUPORTE || process.env.WHATSAPP_COMERCIAL || '5511999999999'
    const user = client.user
    const msgToSupport = `🆕 Nova ordem de serviço #${orderNumber}\nCliente: ${user?.name || user?.email || ''}\nTipo: ${data.type}\nTítulo: ${data.title}\n\n${data.description.slice(0, 200)}${data.description.length > 200 ? '...' : ''}`

    if (process.env.WHATSAPP_API_URL && whatsappNumber) {
      try {
        await sendWhatsApp({ phone: whatsappNumber, message: msgToSupport })
        await prisma.serviceOrder.update({
          where: { id: order.id },
          data: { whatsappSentAt: new Date() },
        })
      } catch {
        // Log but don't fail
      }
    }

    const whatsappMsg = `Olá! Criei a ordem de serviço #${orderNumber} - ${data.title}.\nAguardo retorno.`
    const whatsappUrl = `https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMsg)}`

    return NextResponse.json({
      order,
      whatsappUrl,
      whatsappMessage: whatsappMsg,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao criar ordem de serviço' }, { status: 500 })
  }
}
