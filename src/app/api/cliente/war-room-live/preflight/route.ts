import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { CampaignPreflightStatus } from '@prisma/client'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyWarRoomPreflight } from '@/lib/notifications/admin-events'
import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'
import { getPublicAppBaseUrl } from '@/lib/public-app-url'

const schema = z.object({
  campaignUrl: z
    .string()
    .min(12)
    .max(2000)
    .refine((s) => {
      try {
        const u = new URL(s.includes('://') ? s : `https://${s}`)
        return u.protocol === 'http:' || u.protocol === 'https:'
      } catch {
        return false
      }
    }, 'URL inválida'),
  notes: z.string().max(8000).optional(),
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    include: { user: { select: { email: true } } },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  let body: z.infer<typeof schema>
  try {
    body = schema.parse(await req.json())
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Dados inválidos' }, { status: 400 })
    }
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const url = body.campaignUrl.includes('://') ? body.campaignUrl : `https://${body.campaignUrl}`
  const count = await prisma.supportTicket.count()
  const ticketNumber = `TKT-${String(count + 1).padStart(4, '0')}`

  const ticket = await prisma.supportTicket.create({
    data: {
      clientId: client.id,
      subject: `[Pré-flight] Revisão de campanha antes do play`,
      description: [
        `URL da campanha / conjunto: ${url}`,
        '',
        body.notes?.trim() || '(sem notas adicionais)',
        '',
        `Cliente: ${client.user.email}`,
      ].join('\n'),
      category: 'SOLICITACAO',
      priority: 'HIGH',
      ticketNumber,
    },
  })

  const review = await prisma.campaignPreflightReview.create({
    data: {
      clientId: client.id,
      campaignUrl: url,
      notes: body.notes?.trim() || null,
      status: CampaignPreflightStatus.SUBMITTED,
      ticketId: ticket.id,
    },
  })

  void notifyWarRoomPreflight({
    clientEmail: client.user.email,
    ticketNumber: ticket.ticketNumber,
    campaignUrl: url,
  }).catch((e) => console.error('notifyWarRoomPreflight', e))

  const whatsappNumber = process.env.WHATSAPP_SUPORTE || process.env.WHATSAPP_COMERCIAL || ''
  const base = getPublicAppBaseUrl()
  if (process.env.WHATSAPP_API_URL && whatsappNumber) {
    try {
      await sendWhatsApp({
        phone: whatsappNumber,
        message: [`✈️ PRÉ-FLIGHT`, `#${ticketNumber}`, client.user.email, url.slice(0, 120), base].join('\n'),
      })
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { whatsappSentAt: new Date() },
      })
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({
    id: review.id,
    ticketNumber: ticket.ticketNumber,
    status: review.status,
  })
}
