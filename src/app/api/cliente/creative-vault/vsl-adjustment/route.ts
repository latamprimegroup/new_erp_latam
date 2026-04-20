import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyCreativeVaultVslAdjustment } from '@/lib/notifications/admin-events'

const schema = z.object({
  vslWatchId: z.string().min(1),
  dropOffSeconds: z.number().int().min(0).max(86400),
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

  const watch = await prisma.clienteVslWatch.findFirst({
    where: { id: body.vslWatchId, clientId: client.id },
  })
  if (!watch) return NextResponse.json({ error: 'VSL não encontrada' }, { status: 404 })

  await prisma.clienteVslWatch.update({
    where: { id: watch.id },
    data: { dropOffSeconds: body.dropOffSeconds },
  })

  const count = await prisma.supportTicket.count()
  const ticketNumber = `TKT-${String(count + 1).padStart(4, '0')}`
  const mm = Math.floor(body.dropOffSeconds / 60)
  const ss = body.dropOffSeconds % 60
  const timeLabel = `${mm}m${ss.toString().padStart(2, '0')}s`

  const ticketDescription = [
    `[Creative Vault — Pitch Watch / ajuste VSL]`,
    `VSL: ${watch.vslUrl}`,
    `Drop-off reportado: ${body.dropOffSeconds}s (${timeLabel})`,
    `Cliente: ${client.user.email}`,
    '',
    body.notes?.trim() || '(sem notas adicionais)',
  ].join('\n')

  const ticket = await prisma.supportTicket.create({
    data: {
      clientId: client.id,
      subject: `[Pitch Watch] Ajuste VSL — drop ${timeLabel}`,
      description: ticketDescription,
      category: 'SOLICITACAO',
      priority: 'NORMAL',
      ticketNumber,
    },
  })

  const adj = await prisma.vslAdjustmentRequest.create({
    data: {
      clientId: client.id,
      vslWatchId: watch.id,
      dropOffSeconds: body.dropOffSeconds,
      notes: body.notes?.trim() || null,
      ticketId: ticket.id,
    },
  })

  void notifyCreativeVaultVslAdjustment({
    clientEmail: client.user.email,
    ticketNumber: ticket.ticketNumber,
    dropOffSeconds: body.dropOffSeconds,
  }).catch((e) => console.error('notifyCreativeVaultVslAdjustment', e))

  return NextResponse.json({
    id: adj.id,
    ticketNumber: ticket.ticketNumber,
  })
}
