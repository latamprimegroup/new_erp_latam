import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendTelegramClientSolicitation } from '@/lib/telegram-sales'
import { notifyArmoryProvisioningRequest } from '@/lib/notifications/admin-events'

const schema = z.object({
  trafficSource: z.enum(['GOOGLE_ADS', 'META_ADS', 'TIKTOK_ADS']),
  operationLevel: z.enum(['BEGINNER', 'SCALE', 'BLACK']),
  checkoutUrl: z
    .string()
    .min(12)
    .max(2000)
    .refine((s) => {
      try {
        const u = new URL(s)
        return u.protocol === 'http:' || u.protocol === 'https:'
      } catch {
        return false
      }
    }, 'URL do checkout inválida'),
  notes: z.string().max(4000).optional(),
})

const PLATFORM_PT: Record<string, string> = {
  GOOGLE_ADS: 'Google Ads',
  META_ADS: 'Meta Ads',
  TIKTOK_ADS: 'TikTok Ads',
}

const LEVEL_PT: Record<string, string> = {
  BEGINNER: 'Iniciante',
  SCALE: 'Escala',
  BLACK: 'Black',
}

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
      return NextResponse.json({ error: e.errors[0]?.message || 'Dados inválidos' }, { status: 400 })
    }
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const product = PLATFORM_PT[body.trafficSource]
  const accountType = LEVEL_PT[body.operationLevel]
  const slaHours = Math.max(1, Math.min(168, Number(process.env.ARMORY_SLA_HOURS) || 72))
  const expectedDeliveryAt = new Date(Date.now() + slaHours * 3600 * 1000)

  const notesExtra = [
    body.notes?.trim(),
    `Checkout (Tracker/S2S): ${body.checkoutUrl}`,
    `SLA alvo: ${slaHours}h (configurável ARMORY_SLA_HOURS).`,
  ]
    .filter(Boolean)
    .join('\n')

  const solicitation = await prisma.accountSolicitation.create({
    data: {
      clientId: client.id,
      quantity: 1,
      product,
      accountType,
      status: 'provisioning',
      kind: 'ARMORY',
      trafficSource: body.trafficSource,
      operationLevel: body.operationLevel,
      checkoutUrl: body.checkoutUrl,
      notes: notesExtra,
      expectedDeliveryAt,
    },
  })

  const count = await prisma.supportTicket.count()
  const ticketNumber = `TKT-${String(count + 1).padStart(4, '0')}`
  const ticketDescription = [
    `[Armory — Central de Ativos]`,
    `Solicitação interna ligada a ${solicitation.id}`,
    `Fonte: ${product}`,
    `Nível: ${accountType}`,
    `Checkout: ${body.checkoutUrl}`,
    `Cliente: ${client.user.email}`,
    '',
    body.notes?.trim() || '(sem notas adicionais)',
  ].join('\n')

  const ticket = await prisma.supportTicket.create({
    data: {
      clientId: client.id,
      subject: `[Armory] Provisionamento — ${product} · ${accountType}`,
      description: ticketDescription,
      category: 'SOLICITACAO',
      priority: body.operationLevel === 'BLACK' ? 'HIGH' : 'NORMAL',
      ticketNumber,
    },
  })

  void notifyArmoryProvisioningRequest({
    clientEmail: client.user.email,
    trafficSource: product,
    operationLevel: accountType,
    ticketNumber: ticket.ticketNumber,
  }).catch((e) => console.error('notifyArmoryProvisioningRequest', e))

  void sendTelegramClientSolicitation({
    clientEmail: client.user.email,
    quantity: 1,
    product: `${product} (Armory)`,
    accountType,
    country: null,
  }).catch((e) => console.error('sendTelegramClientSolicitation armory', e))

  return NextResponse.json({
    ok: true,
    solicitationId: solicitation.id,
    ticketNumber: ticket.ticketNumber,
    expectedDeliveryAt: expectedDeliveryAt.toISOString(),
  })
}
