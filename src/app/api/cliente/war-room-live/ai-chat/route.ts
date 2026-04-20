import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { warRoomAlfredoReply } from '@/lib/mentorado/war-room-alfredo-ai'

const schema = z.object({
  message: z.string().min(1).max(4000),
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: z.infer<typeof schema>
  try {
    body = schema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Mensagem inválida' }, { status: 400 })
  }

  const r = await warRoomAlfredoReply(body.message)
  return NextResponse.json({
    reply: r.message,
    suggestEscalation: r.suggestEscalation,
    ticketDraft: {
      subject: '[War Room — Alfredo] Escalação para humano',
      description: [
        'Contexto (última pergunta do mentorado):',
        body.message,
        '',
        'Resposta automática do Alfredo:',
        r.message,
        '',
        `Cliente: ${session.user.email || session.user.id}`,
      ].join('\n'),
    },
  })
}
