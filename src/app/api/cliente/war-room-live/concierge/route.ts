import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyWarRoomConcierge } from '@/lib/notifications/admin-events'
import { getConciergeLinksMerged } from '@/lib/mentorado/war-room-settings'
import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'
import { getPublicAppBaseUrl } from '@/lib/public-app-url'

const schema = z.object({
  kind: z.enum(['infra', 'contingencia', 'estrategia']),
  message: z.string().max(8000).optional(),
})

const SUBJECT: Record<string, string> = {
  infra: '[Concierge VIP → Infra] Suporte técnico',
  contingencia: '[Concierge VIP → Contingência] Conta / Ads / proxy',
  estrategia: '[Concierge VIP → Estratégia] Revisão com especialista',
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    include: { user: { select: { email: true, name: true } } },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  let body: z.infer<typeof schema>
  try {
    body = schema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const links = await getConciergeLinksMerged()
  const direct =
    body.kind === 'infra'
      ? links.infra
      : body.kind === 'contingencia'
        ? links.contingencia
        : links.estrategia

  const trust = client.trustLevelStars != null ? `${client.trustLevelStars}/5` : 'n/d'
  const desc = [
    `Canal Concierge VIP — ${body.kind}`,
    `Confiança operacional (interno): ${trust}`,
    `Cliente: ${client.user.email}`,
    '',
    body.message?.trim() || '(sem mensagem adicional — contacto imediato pedido)',
  ].join('\n')

  const count = await prisma.supportTicket.count()
  const ticketNumber = `TKT-${String(count + 1).padStart(4, '0')}`

  const ticket = await prisma.supportTicket.create({
    data: {
      clientId: client.id,
      subject: SUBJECT[body.kind],
      description: desc,
      category: 'PROBLEMA',
      priority: 'URGENT',
      ticketNumber,
    },
  })

  void notifyWarRoomConcierge({
    clientEmail: client.user.email,
    kind: body.kind,
    ticketNumber: ticket.ticketNumber,
  }).catch((e) => console.error('notifyWarRoomConcierge', e))

  const whatsappNumber = process.env.WHATSAPP_SUPORTE || process.env.WHATSAPP_COMERCIAL || ''
  const base = getPublicAppBaseUrl()
  const adminLink = base ? `${base}/dashboard/admin/tickets` : ''
  if (process.env.WHATSAPP_API_URL && whatsappNumber) {
    try {
      await sendWhatsApp({
        phone: whatsappNumber,
        message: [
          '🆘 CONCIERGE VIP',
          `#${ticketNumber}`,
          `${client.user.email} · ${body.kind}`,
          adminLink,
        ]
          .filter(Boolean)
          .join('\n'),
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
    ticketNumber: ticket.ticketNumber,
    directLink: direct || null,
    ticketId: ticket.id,
  })
}
