import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const postSchema = z.object({
  body: z.string().min(1).max(8000),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const client = await prisma.clientProfile.findUnique({ where: { userId: session.user!.id } })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const { id } = await params
  const rma = await prisma.accountReplacementRequest.findFirst({
    where: { id, clientId: client.id },
  })
  if (!rma) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const messages = await prisma.rmaMessage.findMany({
    where: {
      rmaId: id,
      internalOnly: false,
    },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
  })

  return NextResponse.json({ messages })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const client = await prisma.clientProfile.findUnique({ where: { userId: session.user!.id } })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const { id } = await params
  const rma = await prisma.accountReplacementRequest.findFirst({
    where: { id, clientId: client.id },
  })
  if (!rma) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  try {
    const body = await req.json()
    const data = postSchema.parse(body)
    const msg = await prisma.rmaMessage.create({
      data: {
        rmaId: id,
        userId: session.user!.id,
        body: data.body.trim(),
        internalOnly: false,
      },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    })
    return NextResponse.json(msg)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0]?.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Erro ao enviar' }, { status: 500 })
  }
}
