import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const postSchema = z.object({
  body: z.string().min(1).max(2000),
  kind: z.enum(['chat', 'screen_request']).optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const rows = await prisma.warRoomLiveMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 80,
    include: { user: { select: { name: true, id: true } } },
  })

  const mask = (name: string | null, uid: string) => {
    if (session.user!.id === uid) return 'Tu'
    if (!name?.trim()) return 'Mentorado'
    const p = name.trim().split(/\s+/)[0]
    return p.length <= 2 ? `${p}***` : `${p.slice(0, 1).toUpperCase()}${p.slice(1, 9).toLowerCase()}***`
  }

  return NextResponse.json({
    messages: [...rows].reverse().map((m) => ({
      id: m.id,
      body: m.body,
      kind: m.kind,
      createdAt: m.createdAt.toISOString(),
      author: mask(m.user.name, m.user.id),
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: z.infer<typeof postSchema>
  try {
    body = postSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const row = await prisma.warRoomLiveMessage.create({
    data: {
      userId: session.user!.id,
      body: body.body.trim(),
      kind: body.kind === 'screen_request' ? 'screen_request' : 'chat',
    },
  })

  return NextResponse.json({ id: row.id, createdAt: row.createdAt.toISOString() })
}
