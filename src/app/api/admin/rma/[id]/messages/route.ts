import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const ROLES = ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER', 'DELIVERER', 'COMMERCIAL'] as const

const postSchema = z.object({
  body: z.string().min(1).max(8000),
  internalOnly: z.boolean().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const rma = await prisma.accountReplacementRequest.findUnique({ where: { id } })
  if (!rma) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const messages = await prisma.rmaMessage.findMany({
    where: { rmaId: id },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
  })

  return NextResponse.json({ messages })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const rma = await prisma.accountReplacementRequest.findUnique({ where: { id } })
  if (!rma) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  try {
    const raw = await req.json()
    const data = postSchema.parse(raw)
    const isCommercial = auth.session.user?.role === 'COMMERCIAL'
    const internalOnly = !isCommercial && data.internalOnly === true
    const msg = await prisma.rmaMessage.create({
      data: {
        rmaId: id,
        userId: auth.session.user!.id,
        body: data.body.trim(),
        internalOnly,
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
