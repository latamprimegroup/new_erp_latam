import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  clientId: z.string().min(1),
  orderId: z.string().optional().nullable(),
  channel: z.enum(['WHATSAPP']).default('WHATSAPP'),
})

/** Registra contato WhatsApp (log para CRM). */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const userId = session.user?.id
  if (!userId) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

  try {
    const body = schema.parse(await req.json())
    const client = await prisma.clientProfile.findUnique({ where: { id: body.clientId } })
    if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

    const log = await prisma.commercialContactLog.create({
      data: {
        clientId: body.clientId,
        userId,
        orderId: body.orderId?.trim() || null,
        channel: body.channel,
      },
    })

    await prisma.clientProfile.update({
      where: { id: body.clientId },
      data: { lastContactDate: new Date() },
    })

    return NextResponse.json(log)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    throw e
  }
}
