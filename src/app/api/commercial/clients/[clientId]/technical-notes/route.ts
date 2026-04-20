import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

const postSchema = z.object({
  body: z.string().min(1).max(8000),
})

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL', 'DELIVERER', 'FINANCE'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { clientId } = await params
  const rows = await prisma.clientTechnicalNote.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    take: 80,
    include: { author: { select: { name: true, email: true } } },
  })

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      authorName: r.author.name || r.author.email,
    }))
  )
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { clientId } = await params
  try {
    const { body } = postSchema.parse(await req.json())
    const client = await prisma.clientProfile.findUnique({ where: { id: clientId } })
    if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

    const row = await prisma.clientTechnicalNote.create({
      data: {
        clientId,
        authorId: session.user.id,
        body: body.trim(),
      },
      include: { author: { select: { name: true, email: true } } },
    })

    await audit({
      userId: session.user.id,
      action: 'client_technical_note_created',
      entity: 'ClientProfile',
      entityId: clientId,
      details: { noteId: row.id },
    })

    return NextResponse.json({
      id: row.id,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      authorName: row.author.name || row.author.email,
    })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    throw e
  }
}
