import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  quantity: z.number().int().positive(),
  product: z.string().min(1),
  accountType: z.string().min(1),
  country: z.string().optional(),
  referenceOrderId: z.string().optional(),
  notes: z.string().optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const solicitations = await prisma.accountSolicitation.findMany({
    where: { clientId: client.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(solicitations)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  try {
    const body = await req.json()
    const data = schema.parse(body)

    const solicitation = await prisma.accountSolicitation.create({
      data: {
        clientId: client.id,
        quantity: data.quantity,
        product: data.product,
        accountType: data.accountType,
        country: data.country || null,
        referenceOrderId: data.referenceOrderId || null,
        notes: data.notes || null,
      },
    })

    const user = await prisma.user.findUnique({
      where: { id: session.user!.id },
      select: { email: true },
    })

    const whatsappMsg = data.referenceOrderId
      ? `Olá! Sou ${user?.email || ''}. Gostaria de repetir minha última compra:\n• ${data.quantity} conta(s) - ${data.product} (${data.accountType})\n${data.notes ? `Obs: ${data.notes}` : ''}`
      : `Olá! Sou ${user?.email || ''}. Gostaria de solicitar novas contas:\n• Quantidade: ${data.quantity}\n• Produto: ${data.product}\n• Tipo: ${data.accountType}\n${data.country ? `• País: ${data.country}\n` : ''}${data.notes ? `Obs: ${data.notes}` : ''}`

    const whatsappNumber = process.env.WHATSAPP_COMERCIAL || '5511999999999'
    const whatsappUrl = `https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMsg)}`

    return NextResponse.json({
      solicitation,
      whatsappMessage: whatsappMsg,
      whatsappUrl,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao criar solicitação' }, { status: 500 })
  }
}
